const CategoryRepository = require('../repositories/CategoryRepository');
const ProductRepository = require('../repositories/ProductRepository');
const ProductReviewRepository = require('../repositories/ProductReviewRepository');
const AppError = require('../utils/AppError');

class ProductService {
  async create(data, requester, files = null) {
    if (!['seller', 'admin'].includes(requester.role)) {
      throw new AppError('Apenas vendedores podem cadastrar produtos', 403);
    }

    const category = await CategoryRepository.findById(data.categoryId);
    if (!category) {
      throw new AppError('Categoria não encontrada', 404);
    }

    const productData = this.normalizeProductData(data);
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
    if (requester.role !== 'admin' && !ownsProduct) {
      throw new AppError('Você só pode alterar seus próprios produtos', 403);
    }

    if (data.categoryId) {
      const category = await CategoryRepository.findById(data.categoryId);
      if (!category) {
        throw new AppError('Categoria não encontrada', 404);
      }
    }

    const productData = this.normalizeProductData(data);
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
    if (requester.role !== 'admin' && !ownsProduct) {
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
    if (requester.role !== 'admin' && !ownsProduct) {
      throw new AppError('Você só pode alterar seus próprios produtos', 403);
    }

    return ProductRepository.update(id, { isActive });
  }

  async getReviews(id, requester) {
    const product = await ProductRepository.findById(id);
    if (!product || Number(product.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Produto não encontrado', 404);
    }

    const [reviews, summary] = await Promise.all([
      ProductReviewRepository.findByProductId(id),
      ProductReviewRepository.getSummary(id),
    ]);

    return {
      reviews,
      ...summary,
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
      name: name.slice(0, 80),
      priceAdjustment,
    };
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
