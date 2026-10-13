const CategoryRepository = require('../repositories/CategoryRepository');
const ProductRepository = require('../repositories/ProductRepository');
const ProductReviewRepository = require('../repositories/ProductReviewRepository');
const AppError = require('../utils/AppError');
const { isEnvironmentAdmin } = require('../utils/permissions');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const flavorImageTypes = {
  'image/jpeg': { extensions: ['.jpg', '.jpeg'], matches: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  'image/png': { extensions: ['.png'], matches: (bytes) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  'image/webp': { extensions: ['.webp'], matches: (bytes) => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP' },
};

class ProductService {
  async create(data, requester, files = null) {
    if (requester.role !== 'seller' && !isEnvironmentAdmin(requester)) {
      throw new AppError('Apenas vendedores podem cadastrar produtos', 403);
    }

    const category = await CategoryRepository.findById(data.categoryId);
    if (!category) {
      throw new AppError('Categoria não encontrada', 404);
    }

    const productData = this.normalizeProductData(data);
    productData.flavors = this.attachFlavorImages(productData.flavors || [], [], data.flavorImageIds, files);
    productData.sizeOptions = this.attachOptionImages(productData.sizeOptions || [], [], data.sizeImageIds, files, 'sizeImages');
    productData.addons = this.attachOptionImages(productData.addons || [], [], data.addonImageIds, files, 'addonImages');
    delete productData.flavorImageIds;
    delete productData.sizeImageIds;
    delete productData.addonImageIds;
    const mainImage = this.getMainImage(files);
    const uploadedGallery = this.getGalleryImages(files);
    const imageGallery = this.cleanImageList([
      ...this.normalizeImageGallery(productData.imageGallery),
      ...uploadedGallery,
    ]);

    return ProductRepository.create({
      ...productData,
      imageGallery,
      imageUrl: mainImage || data.imageUrl || imageGallery[0] || null,
      userId: requester.id,
      environmentId: requester.environmentId,
    });
  }

  async getAll(query, requester) {
    return ProductRepository.findAll({
      ...query,
      environmentId: requester.environmentId,
      onlyAvailable: requester.role === 'customer',
    });
  }

  async getById(id, requester) {
    const product = await ProductRepository.findById(id);
    if (!product || Number(product.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Produto não encontrado', 404);
    }

    if (requester.role === 'customer' && (!product.isActive || product.quantity <= 0)) {
      throw new AppError('Produto indisponível', 404);
    }

    const summary = await ProductReviewRepository.getSummary(id);
    return {
      ...product.toJSON(),
      ...summary,
    };
  }

  async update(id, data, requester, files = null) {
    const product = await ProductRepository.findById(id);
    if (!product || Number(product.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Produto não encontrado', 404);
    }

    const ownsProduct = Number(product.userId) === Number(requester.id);
    if (!isEnvironmentAdmin(requester) && !ownsProduct) {
      throw new AppError('Você só pode alterar seus próprios produtos', 403);
    }

    if (data.categoryId) {
      const category = await CategoryRepository.findById(data.categoryId);
      if (!category) {
        throw new AppError('Categoria não encontrada', 404);
      }
    }

    const productData = this.normalizeProductData(data);
    if (Object.prototype.hasOwnProperty.call(productData, 'flavors') || files?.flavorImages?.length) {
      productData.flavors = this.attachFlavorImages(
        productData.flavors ?? this.normalizeFlavors(product.flavors),
        this.normalizeFlavors(product.flavors),
        data.flavorImageIds,
        files
      );
    }
    if (Object.prototype.hasOwnProperty.call(productData, 'sizeOptions') || files?.sizeImages?.length) {
      productData.sizeOptions = this.attachOptionImages(
        productData.sizeOptions ?? this.normalizeChoiceList(product.sizeOptions, 'tamanho', true),
        this.normalizeChoiceList(product.sizeOptions, 'tamanho', true),
        data.sizeImageIds,
        files,
        'sizeImages'
      );
    }
    if (Object.prototype.hasOwnProperty.call(productData, 'addons') || files?.addonImages?.length) {
      productData.addons = this.attachOptionImages(
        productData.addons ?? this.normalizeChoiceList(product.addons, 'adicional', true),
        this.normalizeChoiceList(product.addons, 'adicional', true),
        data.addonImageIds,
        files,
        'addonImages'
      );
    }
    delete productData.flavorImageIds;
    delete productData.sizeImageIds;
    delete productData.addonImageIds;
    const mainImage = this.getMainImage(files);
    const uploadedGallery = this.getGalleryImages(files);
    const hasGalleryInPayload = Object.prototype.hasOwnProperty.call(productData, 'imageGallery');
    const baseGallery = hasGalleryInPayload
      ? this.normalizeImageGallery(productData.imageGallery)
      : this.normalizeImageGallery(product.imageGallery);
    const imageGallery = this.cleanImageList([...baseGallery, ...uploadedGallery]);

    return ProductRepository.update(id, {
      ...productData,
      ...(hasGalleryInPayload || uploadedGallery.length > 0 ? { imageGallery } : {}),
      ...(mainImage && { imageUrl: mainImage }),
    });
  }

  async delete(id, requester) {
    const product = await ProductRepository.findById(id);
    if (!product || Number(product.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Produto não encontrado', 404);
    }

    const ownsProduct = Number(product.userId) === Number(requester.id);
    if (!isEnvironmentAdmin(requester) && !ownsProduct) {
      throw new AppError('Você só pode remover seus próprios produtos', 403);
    }

    await ProductRepository.delete(id);
    return true;
  }

  async updateStatus(id, isActive, requester) {
    const product = await ProductRepository.findById(id);
    if (!product || Number(product.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Produto não encontrado', 404);
    }

    const ownsProduct = Number(product.userId) === Number(requester.id);
    if (!isEnvironmentAdmin(requester) && !ownsProduct) {
      throw new AppError('Você só pode alterar seus próprios produtos', 403);
    }

    return ProductRepository.update(id, { isActive });
  }

  async getReviews(id, requester) {
    const product = await ProductRepository.findById(id);
    if (!product || Number(product.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Produto não encontrado', 404);
    }

    const reviews = await ProductReviewRepository.findByProductId(id);
    const reviewsCount = reviews.length;
    const averageRating = reviewsCount
      ? Number((reviews.reduce((sum, review) => sum + Number(review.rating), 0) / reviewsCount).toFixed(1))
      : 0;

    return {
      reviews,
      averageRating,
      reviewsCount,
    };
  }

  async saveReview(id, data, requester) {
    const product = await ProductRepository.findById(id);
    if (!product || Number(product.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Produto não encontrado', 404);
    }

    if (Number(product.userId) === Number(requester.id)) {
      throw new AppError('Você não pode avaliar seu próprio produto', 400);
    }

    const review = await ProductReviewRepository.save({
      productId: Number(id),
      userId: requester.id,
      rating: data.rating,
      comment: data.comment || null,
    });

    const summary = await ProductReviewRepository.getSummary(id);

    return {
      review,
      ...summary,
    };
  }

  normalizeProductData(data) {
    const productData = { ...data };

    if (Object.prototype.hasOwnProperty.call(productData, 'flavors')) {
      productData.flavors = this.normalizeFlavors(productData.flavors);
    }
    if (Object.prototype.hasOwnProperty.call(productData, 'sizeOptions')) {
      productData.sizeOptions = this.normalizeChoiceList(productData.sizeOptions, 'tamanho');
    }
    if (Object.prototype.hasOwnProperty.call(productData, 'addons')) {
      productData.addons = this.normalizeChoiceList(productData.addons, 'adicional');
    }

    if (Object.prototype.hasOwnProperty.call(productData, 'imageGallery')) {
      productData.imageGallery = this.normalizeImageGallery(productData.imageGallery);
    }

    const hasDiscountPayload = [
      'discountType',
      'discountValue',
      'discountStartsAt',
      'discountEndsAt',
    ].some((key) => Object.prototype.hasOwnProperty.call(productData, key));

    if (hasDiscountPayload) {
      this.normalizeDiscount(productData);
    }

    return productData;
  }

  normalizeDiscount(productData) {
    if (productData.discountType === '') productData.discountType = null;
    if (productData.discountValue === '') productData.discountValue = null;
    if (productData.discountStartsAt === '') productData.discountStartsAt = null;
    if (productData.discountEndsAt === '') productData.discountEndsAt = null;

    if (!productData.discountType || !Number(productData.discountValue || 0)) {
      productData.discountType = null;
      productData.discountValue = null;
      productData.discountStartsAt = null;
      productData.discountEndsAt = null;
      return;
    }

    productData.discountValue = this.parseMoneyValue(productData.discountValue);

    if (productData.discountType === 'percentage' && productData.discountValue > 90) {
      throw new AppError('O desconto percentual não pode passar de 90%', 400);
    }

    if (
      productData.discountStartsAt &&
      productData.discountEndsAt &&
      new Date(productData.discountStartsAt) >= new Date(productData.discountEndsAt)
    ) {
      throw new AppError('A data final do desconto deve ser maior que a data inicial', 400);
    }
  }

  getMainImage(files) {
    const file = files?.image?.[0];
    return file ? `/uploads/${file.filename}` : null;
  }

  getGalleryImages(files) {
    return (files?.images || []).map((file) => `/uploads/${file.filename}`);
  }

  attachFlavorImages(options, previousOptions, rawIds, files) {
    return this.attachOptionImages(options, previousOptions, rawIds, files, 'flavorImages', true);
  }

  attachOptionImages(options, previousOptions, rawIds, files, field, legacyNameMatch = false) {
    const uploads = files?.[field] || [];
    uploads.forEach((file) => this.validateFlavorImage(file));
    let ids = [];
    try {
      ids = rawIds ? JSON.parse(rawIds) : [];
    } catch {
      throw new AppError('Associação das fotos das opções inválida', 400);
    }
    if (!Array.isArray(ids) || ids.length !== uploads.length || new Set(ids).size !== ids.length) {
      throw new AppError('Associação das fotos das opções inválida', 400);
    }

    const previousById = new Map(previousOptions.filter((option) => option.id).map((option) => [option.id, option]));
    const previousByName = legacyNameMatch
      ? new Map(previousOptions.map((option) => [option.name.toLowerCase(), option]))
      : new Map();
    const usedIds = new Set();
    const result = options.map((option) => {
      if (option.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(option.id)) {
        throw new AppError('Identificador de opção inválido', 400);
      }
      const previous = (option.id && previousById.get(option.id)) || previousByName.get(option.name.toLowerCase());
      const id = previous?.id || option.id || randomUUID();
      if (usedIds.has(id)) throw new AppError('Identificador de opção duplicado', 400);
      usedIds.add(id);
      const resultOption = {
        ...option,
        id,
        name: option.name,
        imageUrl: option.removeImage ? null : previous?.imageUrl || null,
      };
      delete resultOption.removeImage;
      return resultOption;
    });

    ids.forEach((id, index) => {
      const option = result.find((item) => item.id === id);
      if (!option) throw new AppError('Foto enviada para opção inexistente neste produto', 400);
      option.imageUrl = `/uploads/${uploads[index].filename}`;
    });
    return result;
  }

  validateFlavorImage(file) {
    const type = flavorImageTypes[file.mimetype];
    const extension = path.extname(file.filename || '').toLowerCase();
    const bytes = file.buffer || (file.path && fs.readFileSync(file.path));
    if (!type || !type.extensions.includes(extension) || !Buffer.isBuffer(bytes) || bytes.length > 2 * 1024 * 1024 || !type.matches(bytes)) {
      throw new AppError('Foto da opção deve ser JPG, PNG ou WebP válido, até 2 MB', 400);
    }
  }

  normalizeFlavors(value) {
    if (Array.isArray(value)) {
      return this.cleanFlavorList(value);
    }

    if (typeof value !== 'string') {
      return [];
    }

    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return this.cleanFlavorList(parsed);
      }
    } catch {
      // Quando vem de formulário, aceitamos texto separado por vírgula ou linha.
    }

    return this.cleanFlavorList(trimmed.split(/[\n,;]+/));
  }

  cleanFlavorList(values) {
    const options = [];
    const usedNames = new Set();

    for (const item of values) {
      const option = this.normalizeFlavorOption(item);
      if (!option) continue;

      const key = option.name.toLowerCase();
      if (usedNames.has(key)) continue;

      usedNames.add(key);
      options.push(option);

      if (options.length >= 20) break;
    }

    return options;
  }

  normalizeFlavorOption(item) {
    if (typeof item === 'string') {
      const name = item.trim();
      if (!name) return null;

      return {
        name: name.slice(0, 80),
        priceAdjustment: 0,
      };
    }

    if (!item || typeof item !== 'object') {
      return null;
    }

    const name = String(item.name || item.label || item.flavor || '').trim();
    if (!name) return null;

    const priceAdjustment = this.parseMoneyValue(
      item.priceAdjustment ?? item.priceDelta ?? item.additionalPrice ?? 0
    );

    return {
      ...(typeof item.id === 'string' && { id: item.id }),
      name: name.slice(0, 80),
      description: String(item.description || '').trim().slice(0, 160),
      priceAdjustment,
      ...(item.imageUrl && { imageUrl: item.imageUrl }),
      ...(item.isActive === false && { isActive: false }),
      ...(item.removeImage && { removeImage: true }),
    };
  }

  normalizeChoiceList(value, label, preserveStoredImage = false) {
    let values = value;
    if (typeof values === 'string') {
      try {
        values = JSON.parse(values);
      } catch {
        throw new AppError(`Lista de ${label}s inválida`, 400);
      }
    }
    if (values == null || values === '') return [];
    if (!Array.isArray(values) || values.length > (label === 'tamanho' ? 20 : 30)) {
      throw new AppError(`Lista de ${label}s inválida`, 400);
    }

    const names = new Set();
    const ids = new Set();
    return values.map((item) => {
      if (!item || typeof item !== 'object') throw new AppError(`${label} inválido`, 400);
      const name = String(item.name || '').trim().slice(0, 80);
      const description = String(item.description || '').trim();
      const key = name.toLocaleLowerCase('pt-BR');
      const price = Number(item.price);
      if (!name || description.length > 160 || names.has(key) || item.price === '' || item.price == null || (item.isActive !== undefined && typeof item.isActive !== 'boolean') || !Number.isFinite(price) || price < (label === 'tamanho' ? 0.01 : 0) || price > 999999 || Math.abs(Math.round(price * 100) - price * 100) > 0.000001) {
        throw new AppError(`${label} duplicado ou com preço inválido`, 400);
      }
      names.add(key);
      if (item.id) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.id)) {
          throw new AppError(`Identificador de ${label} inválido`, 400);
        }
        if (ids.has(item.id)) throw new AppError(`Identificador de ${label} duplicado`, 400);
        ids.add(item.id);
      }
      return {
        id: item.id || (label === 'adicional' ? randomUUID() : undefined),
        name,
        description,
        price,
        isActive: item.isActive !== false,
        ...(preserveStoredImage && item.imageUrl && { imageUrl: item.imageUrl }),
        ...(item.removeImage && { removeImage: true }),
      };
    });
  }

  parseMoneyValue(value) {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
    }

    const rawValue = String(value || '').trim().replace(/\s/g, '');
    const normalized = rawValue.includes(',')
      ? rawValue.replace(/\./g, '').replace(',', '.')
      : rawValue;
    const number = Number(normalized);

    return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
  }

  normalizeImageGallery(value) {
    if (Array.isArray(value)) {
      return this.cleanImageList(value);
    }

    if (typeof value !== 'string') {
      return [];
    }

    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return this.cleanImageList(parsed);
      }
    } catch {
      // Aceita URLs em linhas separadas no formulário do vendedor.
    }

    return this.cleanImageList(trimmed.split(/[\n,;]+/));
  }

  cleanImageList(values) {
    return Array.from(new Set(
      values
        .map((item) => String(item).trim())
        .filter(Boolean)
        .slice(0, 12)
    ));
  }
}

module.exports = new ProductService();
