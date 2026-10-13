const { sequelize, Product, Order, OrderItem, Environment, UserEnvironment } = require('../models');
const OrderRepository = require('../repositories/OrderRepository');
const CouponRepository = require('../repositories/CouponRepository');
const ProductRepository = require('../repositories/ProductRepository');
const UserRepository = require('../repositories/UserRepository');
const AppError = require('../utils/AppError');
const { calculateCommission } = require('../utils/platformFee');
const PaymentService = require('./PaymentService');
const PlanService = require('./PlanService');
const { isEnvironmentAdmin } = require('../utils/permissions');

const finalStatuses = ['delivered', 'canceled', 'refused'];
const sellerStatusFlow = ['accepted', 'preparing', 'ready', 'delivered', 'refused'];
const toCents = (value) => Math.round(Number(value) * 100);
const fromCents = (value) => Number((value / 100).toFixed(2));

class OrderService {
  async create(data, requester) {
    const [environment, buyerMembership] = await Promise.all([
      requester.environmentId ? Environment.findByPk(requester.environmentId, { attributes: ['status'] }) : null,
      requester.environmentId ? UserEnvironment.findOne({ where: { userId: requester.id, environmentId: requester.environmentId, status: 'approved' } }) : null,
    ]);
    if (requester.isSuspended || environment?.status !== 'active' || !buyerMembership) {
      throw new AppError('Entre em um ambiente ativo com participação aprovada antes de comprar', 403);
    }
    const seller = await UserRepository.findById(data.sellerId);
    if (!seller || Number(seller.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Vendedor não encontrado neste ambiente', 404);
    }

    if (Number(data.sellerId) === Number(requester.id)) {
      throw new AppError('Você não pode comprar seus próprios produtos', 400);
    }

    if (seller.role !== 'seller' && !isEnvironmentAdmin(seller)) {
      throw new AppError('O usuário informado não é vendedor', 400);
    }

    const sellerMembership = await UserEnvironment.findOne({ where: { userId: seller.id, environmentId: requester.environmentId, status: 'approved' } });
    if (!sellerMembership || !['seller', 'environment_admin', 'admin'].includes(sellerMembership.role) || seller.isSuspended) {
      throw new AppError('Este vendedor não está autorizado a receber novos pedidos', 403);
    }

    await PaymentService.ensureSellerAcceptsPaymentMethod(
      data.sellerId,
      requester.environmentId,
      data.paymentMethod
    );
    await PaymentService.ensureConnectedPayoutAccount(data.sellerId, requester.environmentId);
    const subscription = await PlanService.ensureBasicSubscription(data.sellerId, requester.environmentId);

    const groupedItems = this.groupItems(data.items);

    let payment = null;
    const createdOrder = await sequelize.transaction(async (transaction) => {
      const preparedItems = [];
      let totalCents = 0;

      for (const item of groupedItems) {
        const product = await ProductRepository.findByIdForUpdate(item.productId, transaction);

        if (!product || Number(product.environmentId) !== Number(requester.environmentId)) {
          throw new AppError(`Produto ${item.productId} não encontrado neste ambiente`, 404);
        }

        if (Number(product.userId) !== Number(data.sellerId)) {
          throw new AppError('Todos os produtos do pedido devem ser do mesmo vendedor', 400);
        }

        if (!product.isActive || product.quantity < item.quantity) {
          throw new AppError(`Produto indisponível ou sem estoque: ${product.name}`, 400);
        }

        const preparedItem = this.prepareItem(product, item);
        totalCents += toCents(preparedItem.subtotal);

        await product.update(
          { quantity: product.quantity - item.quantity },
          { transaction }
        );

        preparedItems.push(preparedItem);
      }

      const couponResult = await this.resolveCoupon({
        couponCode: data.couponCode,
        sellerId: data.sellerId,
        environmentId: requester.environmentId,
        totalPrice: fromCents(totalCents),
        transaction,
      });
      const commissionRate = Number(subscription.commissionRate);

      const order = await OrderRepository.create(
        {
          customerId: requester.id,
          sellerId: data.sellerId,
          environmentId: requester.environmentId,
          status: 'pending',
          totalPrice: couponResult.finalTotal,
          couponId: couponResult.coupon?.id || null,
          couponCode: couponResult.coupon?.code || null,
          couponDiscount: couponResult.discount,
          platformFeeRate: commissionRate,
          platformFeeAmount: 0,
          sellerNetAmount: 0,
          grossSalesAmount: couponResult.finalTotal,
          commissionRate,
          commissionAmount: 0,
          sellerNetRevenue: 0,
          commissionConfirmedAt: null,
          isPaymentSimulated: PaymentService.isMockMode(),
          paymentMethod: data.paymentMethod,
          paymentStatus: PaymentService.requiresPayment(data.paymentMethod) ? 'pending' : 'not_required',
          paymentProvider: PaymentService.isMockMode() ? 'mock' : PaymentService.isOnlinePayment(data.paymentMethod) ? 'mercado_pago' : 'manual',
          deliveryType: data.deliveryType,
          deliveryLocation: data.deliveryLocation,
          observation: data.observation,
        },
        preparedItems,
        transaction
      );

      if (couponResult.coupon) {
        await couponResult.coupon.increment('usedCount', { by: 1, transaction });
      }

      if (PaymentService.isMockMode()) {
        payment = await PaymentService.createPaymentForOrder(order.id, transaction, order);
      }

      return order;
    });

    if (!PaymentService.isMockMode()) {
      payment = await PaymentService.createPaymentForOrder(createdOrder.id);
    }
    const order = await OrderRepository.findById(createdOrder.id);

    return { order, payment };
  }

  groupItems(items) {
    const grouped = new Map();

    for (const item of items) {
      const selectedFlavor = item.selectedFlavor ? String(item.selectedFlavor).trim() : null;
      const selectedSizeId = item.selectedSizeId || null;
      const selectedAddonIds = [...(item.selectedAddonIds || [])].sort();
      if (new Set(selectedAddonIds).size !== selectedAddonIds.length) throw new AppError('Adicionais duplicados', 400);
      const key = JSON.stringify([item.productId, selectedFlavor, selectedSizeId, selectedAddonIds]);
      const current = grouped.get(key) || {
        productId: item.productId,
        selectedFlavor,
        selectedSizeId,
        selectedAddonIds,
        quantity: 0,
      };
      current.quantity += item.quantity;
      grouped.set(key, current);
    }

    return Array.from(grouped.values());
  }

  prepareItem(product, item) {
    const flavor = this.resolveSelectedOption(product, item.selectedFlavor);
    const size = this.resolveSize(product, item.selectedSizeId);
    const addons = this.resolveAddons(product, item.selectedAddonIds);
    const baseCents = (size ? toCents(size.price) : toCents(product.price)) + toCents(flavor.priceAdjustment);
    const discountedBaseCents = this.applyProductDiscountCents(product, baseCents);
    const unitCents = discountedBaseCents + addons.reduce((sum, addon) => sum + toCents(addon.price), 0);
    if (baseCents <= 0 || unitCents <= 0) throw new AppError(`Opção selecionada possui preço inválido: ${product.name}`, 400);

    // Desconto do produto incide apenas na base; cupom é aplicado depois ao pedido inteiro.
    return {
      productId: product.id,
      selectedFlavor: flavor.name,
      imageUrl: size?.imageUrl || flavor.imageUrl || product.imageUrl || null,
      optionsSnapshot: {
        basePrice: fromCents(baseCents),
        size: size ? { id: size.id, name: size.name, ...(size.description && { description: size.description }), price: fromCents(toCents(size.price)), ...(size.imageUrl && { imageUrl: size.imageUrl }) } : null,
        flavor: flavor.name ? { name: flavor.name, ...(flavor.description && { description: flavor.description }), priceAdjustment: fromCents(toCents(flavor.priceAdjustment)), ...(flavor.imageUrl && { imageUrl: flavor.imageUrl }) } : null,
        addons: addons.map((addon) => ({ id: addon.id, name: addon.name, ...(addon.description && { description: addon.description }), price: fromCents(toCents(addon.price)), ...(addon.imageUrl && { imageUrl: addon.imageUrl }) })),
        productDiscount: fromCents(baseCents - discountedBaseCents),
      },
      quantity: item.quantity,
      unitPrice: fromCents(unitCents),
      subtotal: fromCents(unitCents * item.quantity),
    };
  }

  resolveSelectedOption(product, selectedFlavor) {
    const options = this.parseProductOptions(product.flavors);
    const flavorName = selectedFlavor ? String(selectedFlavor).trim() : '';

    if (!flavorName) {
      return {
        name: null,
        priceAdjustment: 0,
        imageUrl: product.imageUrl || null,
      };
    }

    const selectedOption = options.find(
      (option) => option.name.toLowerCase() === flavorName.toLowerCase() && option.isActive !== false
    );

    if (!selectedOption) {
      throw new AppError(`Opção selecionada inválida para o produto: ${product.name}`, 400);
    }

    return selectedOption;
  }

  resolveSize(product, selectedSizeId) {
    const sizes = Array.isArray(product.sizeOptions) ? product.sizeOptions : [];
    if (sizes.length === 0) {
      if (selectedSizeId) throw new AppError('Tamanho inválido para este produto', 400);
      return null;
    }
    const size = sizes.find((option) => option.id === selectedSizeId && option.isActive !== false);
    if (!size) throw new AppError('Escolha um tamanho ativo deste produto', 400);
    return size;
  }

  resolveAddons(product, selectedAddonIds = []) {
    const options = Array.isArray(product.addons) ? product.addons : [];
    if (!Array.isArray(selectedAddonIds) || new Set(selectedAddonIds).size !== selectedAddonIds.length) {
      throw new AppError('Adicionais inválidos', 400);
    }
    return selectedAddonIds.map((id) => {
      const option = options.find((candidate) => candidate.id === id && candidate.isActive !== false);
      if (!option) throw new AppError('Adicional inválido para este produto', 400);
      return option;
    });
  }

  parseProductOptions(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (typeof item === 'string') {
          const name = item.trim();
          return name ? { name, priceAdjustment: 0, imageUrl: null } : null;
        }

        if (!item || typeof item !== 'object') return null;

        const name = String(item.name || '').trim();
        if (!name) return null;

        const priceAdjustment = Number(item.priceAdjustment || 0);

        return {
          name,
          ...(item.description && { description: item.description }),
          priceAdjustment: Number.isFinite(priceAdjustment) ? priceAdjustment : 0,
          imageUrl: item.imageUrl || null,
          ...(item.isActive === false && { isActive: false }),
        };
      })
      .filter(Boolean);
  }

  applyProductDiscount(product, price) {
    return fromCents(this.applyProductDiscountCents(product, toCents(price)));
  }

  applyProductDiscountCents(product, baseCents) {
    const discount = this.getActiveDiscount(product);
    if (!discount) return baseCents;

    const discountAmount = discount.type === 'percentage'
      ? Math.round(baseCents * (discount.value / 100))
      : toCents(discount.value);

    return Math.max(1, baseCents - discountAmount);
  }

  getActiveDiscount(product) {
    const type = product.discountType;
    const value = Number(product.discountValue || 0);

    if (!type || value <= 0) return null;

    const now = new Date();
    if (product.discountStartsAt && new Date(product.discountStartsAt) > now) return null;
    if (product.discountEndsAt && new Date(product.discountEndsAt) < now) return null;

    return { type, value };
  }

  async resolveCoupon({ couponCode, sellerId, environmentId, totalPrice, transaction }) {
    const code = String(couponCode || '').trim().toUpperCase();
    if (!code) {
      return {
        coupon: null,
        discount: 0,
        finalTotal: Number(totalPrice.toFixed(2)),
      };
    }

    const coupon = await CouponRepository.findByCodeForOrder(
      code,
      sellerId,
      environmentId,
      transaction
    );

    if (!coupon || !coupon.isActive) {
      throw new AppError('Cupom inválido para este vendedor', 400);
    }

    const now = new Date();
    if (coupon.startsAt && new Date(coupon.startsAt) > now) {
      throw new AppError('Este cupom ainda não começou', 400);
    }

    if (coupon.endsAt && new Date(coupon.endsAt) < now) {
      throw new AppError('Este cupom expirou', 400);
    }

    if (coupon.usageLimit && Number(coupon.usedCount) >= Number(coupon.usageLimit)) {
      throw new AppError('Este cupom atingiu o limite de uso', 400);
    }

    const value = Number(coupon.discountValue);
    const totalCents = toCents(totalPrice);
    const discountCents = coupon.discountType === 'percentage'
      ? Math.round(totalCents * (value / 100))
      : toCents(value);
    const safeDiscountCents = Math.min(totalCents, Math.max(0, discountCents));

    return {
      coupon,
      discount: fromCents(safeDiscountCents),
      finalTotal: fromCents(totalCents - safeDiscountCents),
    };
  }

  async getMyOrders(query, requester) {
    return OrderRepository.findAll({
      where: {
        customerId: requester.id,
        environmentId: requester.environmentId,
        ...(query.status && { status: query.status }),
      },
      page: query.page,
      limit: query.limit,
    });
  }

  async getSellerOrders(query, requester) {
    if (requester.role !== 'seller' && !isEnvironmentAdmin(requester)) {
      throw new AppError('Apenas vendedores podem ver pedidos recebidos', 403);
    }

    return OrderRepository.findAll({
      where: {
        environmentId: requester.environmentId,
        ...(requester.role === 'seller' && { sellerId: requester.id }),
        ...(query.status && { status: query.status }),
      },
      page: query.page,
      limit: query.limit,
    });
  }

  async getById(id, requester) {
    const order = await OrderRepository.findById(id);
    if (!order || Number(order.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Pedido não encontrado', 404);
    }

    const ownsAsCustomer = Number(order.customerId) === Number(requester.id);
    const ownsAsSeller = Number(order.sellerId) === Number(requester.id);

    if (!isEnvironmentAdmin(requester) && !ownsAsCustomer && !ownsAsSeller) {
      throw new AppError('Você não tem acesso a este pedido', 403);
    }

    return order;
  }

  async updateStatus(id, status, requester) {
    if (!sellerStatusFlow.includes(status)) {
      throw new AppError('Status inválido para atualização pelo vendedor', 400);
    }

    const order = await this.getById(id, requester);

    if (!isEnvironmentAdmin(requester) && Number(order.sellerId) !== Number(requester.id)) {
      throw new AppError('Apenas o vendedor do pedido pode atualizar o status', 403);
    }

    let duplicateOperation = null;
    try {
      const result = await sequelize.transaction(async (transaction) => {
        const orderToUpdate = await Order.findByPk(id, { lock: transaction.LOCK.UPDATE, transaction });
        if (!orderToUpdate) throw new AppError('Pedido não encontrado', 404);

        if (finalStatuses.includes(orderToUpdate.status)) {
          if (orderToUpdate.status === status && status === 'delivered') return { duplicateOperation: 'settlement' };
          if (orderToUpdate.status === status && status === 'refused') return { duplicateOperation: 'refund' };
          throw new AppError('Pedido finalizado não pode ser alterado', 409);
        }

        if (status !== 'refused' && PaymentService.requiresConfirmedPayment(orderToUpdate) && !['held', 'settled', 'paid'].includes(orderToUpdate.paymentStatus)) {
          throw new AppError('Confirme o pagamento antes de avançar o pedido', 400);
        }

        const updateData = { status };
        if (status === 'delivered') {
          if (PaymentService.isMockMode()) {
            await PaymentService.settleMockPayment(orderToUpdate, requester.id, transaction);
          } else {
            const commission = calculateCommission(orderToUpdate.grossSalesAmount, orderToUpdate.commissionRate);
            Object.assign(updateData, { commissionAmount: commission.amount, sellerNetRevenue: commission.sellerNetAmount, commissionConfirmedAt: new Date(), platformFeeAmount: commission.amount, sellerNetAmount: commission.sellerNetAmount });
          }
        }
        if (status === 'refused') {
          if (PaymentService.isMockMode()) await PaymentService.refundMockPayment(orderToUpdate, requester.id, transaction);
          await this.restoreStock(orderToUpdate.id, transaction);
          Object.assign(updateData, { commissionAmount: 0, sellerNetRevenue: 0, commissionConfirmedAt: null, platformFeeAmount: 0, sellerNetAmount: 0 });
        }
        await orderToUpdate.update(updateData, { transaction });
        return { duplicateOperation: null };
      });
      duplicateOperation = result.duplicateOperation;
    } catch (error) {
      if (error.statusCode === 409) await PaymentService.auditDuplicateForOrder(id, requester.id, `status_${status}`);
      throw error;
    }

    if (duplicateOperation) await PaymentService.auditDuplicateForOrder(id, requester.id, duplicateOperation);

    return OrderRepository.findById(id);
  }

  async cancel(id, requester) {
    const order = await this.getById(id, requester);

    if (Number(order.customerId) !== Number(requester.id)) {
      throw new AppError('Apenas o cliente pode cancelar o próprio pedido', 403);
    }

    let duplicateRefund = false;
    try {
      duplicateRefund = await sequelize.transaction(async (transaction) => {
        const orderToUpdate = await Order.findByPk(id, { lock: transaction.LOCK.UPDATE, transaction });
        if (!orderToUpdate) throw new AppError('Pedido não encontrado', 404);
        if (orderToUpdate.status === 'canceled') return true;
        if (orderToUpdate.status !== 'pending') throw new AppError('Somente pedidos pendentes podem ser cancelados', 409);
        if (PaymentService.isMockMode()) await PaymentService.refundMockPayment(orderToUpdate, requester.id, transaction);
        await this.restoreStock(orderToUpdate.id, transaction);
        await orderToUpdate.update({ status: 'canceled', commissionAmount: 0, sellerNetRevenue: 0, commissionConfirmedAt: null, platformFeeAmount: 0, sellerNetAmount: 0 }, { transaction });
        return false;
      });
    } catch (error) {
      if (error.statusCode === 409) await PaymentService.auditDuplicateForOrder(id, requester.id, 'refund');
      throw error;
    }

    if (duplicateRefund) await PaymentService.auditDuplicateForOrder(id, requester.id, 'refund');

    return OrderRepository.findById(id);
  }

  async restoreStock(orderId, transaction) {
    const items = await OrderItem.findAll({
      where: { orderId },
      transaction,
    });

    for (const item of items) {
      const product = await Product.findByPk(item.productId, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      });

      if (product) {
        await product.update(
          { quantity: product.quantity + item.quantity },
          { transaction }
        );
      }
    }
  }
}

module.exports = new OrderService();
