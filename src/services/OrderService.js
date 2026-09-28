const { sequelize, Product, OrderItem } = require('../models');
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

class OrderService {
  async create(data, requester) {
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
      let totalPrice = 0;

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

        const selectedOption = this.resolveSelectedOption(product, item.selectedFlavor);
        const optionPrice = Number((Number(product.price) + selectedOption.priceAdjustment).toFixed(2));
        const unitPrice = this.applyProductDiscount(product, optionPrice);

        if (unitPrice <= 0) {
          throw new AppError(`Opção selecionada possui preço inválido: ${product.name}`, 400);
        }

        const subtotal = Number((unitPrice * item.quantity).toFixed(2));
        totalPrice += subtotal;

        await product.update(
          { quantity: product.quantity - item.quantity },
          { transaction }
        );

        preparedItems.push({
          productId: product.id,
          selectedFlavor: selectedOption.name,
          quantity: item.quantity,
          unitPrice,
          subtotal,
        });
      }

      const couponResult = await this.resolveCoupon({
        couponCode: data.couponCode,
        sellerId: data.sellerId,
        environmentId: requester.environmentId,
        totalPrice,
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
      const key = `${item.productId}:${selectedFlavor || ''}`;
      const current = grouped.get(key) || {
        productId: item.productId,
        selectedFlavor,
        quantity: 0,
      };
      current.quantity += item.quantity;
      grouped.set(key, current);
    }

    return Array.from(grouped.values());
  }

  resolveSelectedOption(product, selectedFlavor) {
    const options = this.parseProductOptions(product.flavors);
    const flavorName = selectedFlavor ? String(selectedFlavor).trim() : '';

    if (!flavorName) {
      return {
        name: null,
        priceAdjustment: 0,
      };
    }

    const selectedOption = options.find(
      (option) => option.name.toLowerCase() === flavorName.toLowerCase()
    );

    if (!selectedOption) {
      throw new AppError(`Opção selecionada inválida para o produto: ${product.name}`, 400);
    }

    return selectedOption;
  }

  parseProductOptions(value) {
    if (!Array.isArray(value)) {
      return [];
    }

    return value
      .map((item) => {
        if (typeof item === 'string') {
          const name = item.trim();
          return name ? { name, priceAdjustment: 0 } : null;
        }

        if (!item || typeof item !== 'object') return null;

        const name = String(item.name || '').trim();
        if (!name) return null;

        const priceAdjustment = Number(item.priceAdjustment || 0);

        return {
          name,
          priceAdjustment: Number.isFinite(priceAdjustment) ? priceAdjustment : 0,
        };
      })
      .filter(Boolean);
  }

  applyProductDiscount(product, price) {
    const discount = this.getActiveDiscount(product);
    if (!discount) return price;

    const discountAmount = discount.type === 'percentage'
      ? price * (discount.value / 100)
      : discount.value;

    return Number(Math.max(0.01, price - discountAmount).toFixed(2));
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
    const discount = coupon.discountType === 'percentage'
      ? totalPrice * (value / 100)
      : value;
    const safeDiscount = Number(Math.min(totalPrice, Math.max(0, discount)).toFixed(2));

    return {
      coupon,
      discount: safeDiscount,
      finalTotal: Number(Math.max(0, totalPrice - safeDiscount).toFixed(2)),
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

    if (finalStatuses.includes(order.status)) {
      if (order.status === 'delivered' && status === 'delivered') {
        await PaymentService.auditDuplicateForOrder(order.id, requester.id, 'settlement');
      }
      if (['canceled', 'refused'].includes(order.status) && status === 'refused') {
        await PaymentService.auditDuplicateForOrder(order.id, requester.id, 'refund');
      }
      throw new AppError('Pedido finalizado não pode ser alterado', 400);
    }

    if (
      status !== 'refused' &&
      PaymentService.requiresConfirmedPayment(order) &&
      !['held', 'settled', 'paid'].includes(order.paymentStatus)
    ) {
      throw new AppError('Confirme o pagamento antes de avançar o pedido', 400);
    }

    await sequelize.transaction(async (transaction) => {
      if (status === 'refused') {
        await this.restoreStock(order.id, transaction);
      }

      const orderToUpdate = await order.reload({ transaction });
      const updateData = { status };
      if (status === 'delivered') {
        if (PaymentService.isMockMode()) {
          await PaymentService.settleMockPayment(orderToUpdate, requester.id, transaction);
        } else {
          const commission = calculateCommission(orderToUpdate.grossSalesAmount, orderToUpdate.commissionRate);
          Object.assign(updateData, {
            commissionAmount: commission.amount,
            sellerNetRevenue: commission.sellerNetAmount,
            commissionConfirmedAt: new Date(),
            platformFeeAmount: commission.amount,
            sellerNetAmount: commission.sellerNetAmount,
          });
        }
      }
      if (status === 'refused') {
        if (PaymentService.isMockMode()) await PaymentService.refundMockPayment(orderToUpdate, requester.id, transaction);
        Object.assign(updateData, {
          commissionAmount: 0,
          sellerNetRevenue: 0,
          commissionConfirmedAt: null,
          platformFeeAmount: 0,
          sellerNetAmount: 0,
        });
      }
      await orderToUpdate.update(updateData, { transaction });
    });

    return OrderRepository.findById(id);
  }

  async cancel(id, requester) {
    const order = await this.getById(id, requester);

    if (Number(order.customerId) !== Number(requester.id)) {
      throw new AppError('Apenas o cliente pode cancelar o próprio pedido', 403);
    }

    if (order.status !== 'pending') {
      if (['canceled', 'refused'].includes(order.status)) {
        await PaymentService.auditDuplicateForOrder(order.id, requester.id, 'refund');
      }
      throw new AppError('Somente pedidos pendentes podem ser cancelados', 400);
    }

    await sequelize.transaction(async (transaction) => {
      await this.restoreStock(order.id, transaction);
      const orderToUpdate = await order.reload({ transaction });
      if (PaymentService.isMockMode()) await PaymentService.refundMockPayment(orderToUpdate, requester.id, transaction);
      await orderToUpdate.update({
        status: 'canceled',
        commissionAmount: 0,
        sellerNetRevenue: 0,
        commissionConfirmedAt: null,
        platformFeeAmount: 0,
        sellerNetAmount: 0,
      }, { transaction });
    });

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
