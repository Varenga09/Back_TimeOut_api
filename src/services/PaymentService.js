const crypto = require('crypto');

const { sequelize, Order } = require('../models');
const OrderRepository = require('../repositories/OrderRepository');
const PaymentSettingRepository = require('../repositories/PaymentSettingRepository');
const PaymentTransactionRepository = require('../repositories/PaymentTransactionRepository');
const UserRepository = require('../repositories/UserRepository');
const AppError = require('../utils/AppError');
const MercadoPagoService = require('./MercadoPagoService');

const onlinePaymentMethods = ['pix', 'credit_card', 'debit_card'];

const paymentMethodFields = {
  pix: 'acceptsPix',
  credit_card: 'acceptsCreditCard',
  debit_card: 'acceptsDebitCard',
  cash: 'acceptsCash',
  card_in_person: 'acceptsCardInPerson',
  arrange_with_seller: 'acceptsArrangeWithSeller',
};

class PaymentService {
  isOnlinePayment(method) {
    return onlinePaymentMethods.includes(method);
  }

  async getMySettings(requester) {
    this.ensureSeller(requester);
    return PaymentSettingRepository.findOrCreateBySeller(requester.id, requester.environmentId);
  }

  async getSellerSettings(sellerId, requester) {
    const seller = await UserRepository.findById(sellerId);
    if (!seller || Number(seller.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Vendedor não encontrado neste ambiente', 404);
    }

    const settings = await PaymentSettingRepository.findOrCreateBySeller(seller.id, seller.environmentId);
    return this.toPublicSettings(settings);
  }

  async updateMySettings(data, requester) {
    this.ensureSeller(requester);
    const settings = await PaymentSettingRepository.findOrCreateBySeller(requester.id, requester.environmentId);

    return PaymentSettingRepository.update(settings, {
      provider: data.provider || settings.provider,
      providerAccountId: data.providerAccountId,
      acceptsPix: data.acceptsPix,
      acceptsCreditCard: data.acceptsCreditCard,
      acceptsDebitCard: data.acceptsDebitCard,
      acceptsCash: data.acceptsCash,
      acceptsCardInPerson: data.acceptsCardInPerson,
      acceptsArrangeWithSeller: data.acceptsArrangeWithSeller,
      isActive: data.isActive,
    });
  }

  async ensureSellerAcceptsPaymentMethod(sellerId, environmentId, paymentMethod) {
    const settings = await PaymentSettingRepository.findOrCreateBySeller(sellerId, environmentId);
    const field = paymentMethodFields[paymentMethod];

    if (!field) {
      throw new AppError('Forma de pagamento inválida', 400);
    }

    if (!settings.isActive || !settings[field]) {
      throw new AppError('O vendedor não aceita esta forma de pagamento', 400);
    }

    return settings;
  }

  async createPaymentForOrder(orderId) {
    const order = await OrderRepository.findById(orderId);
    if (!order || !this.isOnlinePayment(order.paymentMethod)) {
      return null;
    }

    const existingTransaction = await PaymentTransactionRepository.findLatestByOrder(order.id);
    if (existingTransaction?.status === 'approved') {
      return existingTransaction;
    }

    const baseTransaction = {
      orderId: order.id,
      customerId: order.customerId,
      sellerId: order.sellerId,
      environmentId: order.environmentId,
      provider: 'mercado_pago',
      externalReference: String(order.id),
      method: order.paymentMethod,
      status: 'pending',
      amount: Number(order.totalPrice),
      paidAmount: 0,
    };

    if (order.paymentMethod === 'pix') {
      const pixResult = await MercadoPagoService.createPixPayment({ order });
      if (!pixResult.configured) {
        return PaymentTransactionRepository.create({
          ...baseTransaction,
          failureReason: pixResult.reason,
          rawResponse: JSON.stringify({ reason: pixResult.reason }),
        });
      }

      return PaymentTransactionRepository.create({
        ...baseTransaction,
        providerPaymentId: pixResult.providerPaymentId,
        status: pixResult.status,
        paidAmount: pixResult.status === 'approved' ? Number(order.totalPrice) : 0,
        qrCode: pixResult.qrCode,
        qrCodeBase64: pixResult.qrCodeBase64,
        checkoutUrl: pixResult.checkoutUrl,
        rawResponse: JSON.stringify(pixResult.response),
      });
    }

    const checkoutResult = await MercadoPagoService.createCardCheckout({ order });
    if (!checkoutResult.configured) {
      return PaymentTransactionRepository.create({
        ...baseTransaction,
        failureReason: checkoutResult.reason,
        rawResponse: JSON.stringify({ reason: checkoutResult.reason }),
      });
    }

    return PaymentTransactionRepository.create({
      ...baseTransaction,
      providerPreferenceId: checkoutResult.providerPreferenceId,
      status: checkoutResult.status,
      checkoutUrl: checkoutResult.checkoutUrl,
      rawResponse: JSON.stringify(checkoutResult.response),
    });
  }

  async retryPayment(orderId, requester) {
    const order = await OrderRepository.findById(orderId);
    if (!order || Number(order.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Pedido não encontrado', 404);
    }

    if (Number(order.customerId) !== Number(requester.id)) {
      throw new AppError('Apenas o cliente pode gerar pagamento deste pedido', 403);
    }

    if (!this.isOnlinePayment(order.paymentMethod)) {
      throw new AppError('Este pedido não usa pagamento online', 400);
    }

    if (order.paymentStatus === 'paid') {
      throw new AppError('Este pedido já foi pago', 400);
    }

    return this.createPaymentForOrder(order.id);
  }

  async handleMercadoPagoWebhook(payload, query = {}, headers = {}) {
    this.verifyMercadoPagoSignature(payload, query, headers);

    const providerPaymentId =
      payload?.data?.id ||
      payload?.id ||
      query['data.id'] ||
      query.id;

    if (!providerPaymentId) {
      return { received: true, ignored: true };
    }

    const payment = await MercadoPagoService.getPayment(providerPaymentId);
    const externalReference = String(payment.external_reference || '');
    const order = await Order.findByPk(Number(externalReference));

    if (!order) {
      return { received: true, ignored: true };
    }

    const paidAmount = Number(payment.transaction_amount || 0);
    const expectedAmount = Number(order.totalPrice);
    const mappedStatus = MercadoPagoService.mapPaymentStatus(payment.status);
    const paymentTransaction =
      await PaymentTransactionRepository.findByProviderPaymentId(String(providerPaymentId)) ||
      await PaymentTransactionRepository.findByExternalReference(externalReference);

    const paymentData = {
      providerPaymentId: String(providerPaymentId),
      status: mappedStatus,
      paidAmount: mappedStatus === 'approved' ? paidAmount : 0,
      rawResponse: JSON.stringify(payment),
      failureReason: mappedStatus === 'approved' ? null : payment.status_detail || null,
      paidAt: mappedStatus === 'approved' ? new Date() : null,
    };

    await sequelize.transaction(async (transaction) => {
      if (paymentTransaction) {
        await PaymentTransactionRepository.update(paymentTransaction, paymentData, transaction);
      } else {
        await PaymentTransactionRepository.create(
          {
            orderId: order.id,
            customerId: order.customerId,
            sellerId: order.sellerId,
            environmentId: order.environmentId,
            provider: 'mercado_pago',
            externalReference,
            method: order.paymentMethod,
            amount: expectedAmount,
            ...paymentData,
          },
          transaction
        );
      }

      if (mappedStatus === 'approved' && paidAmount === expectedAmount) {
        await order.update(
          {
            paymentStatus: 'paid',
            paidAt: new Date(),
          },
          { transaction }
        );
      } else if (mappedStatus === 'approved' && paidAmount !== expectedAmount) {
        await order.update(
          {
            paymentStatus: 'failed',
          },
          { transaction }
        );
      } else if (['rejected', 'cancelled', 'failed'].includes(mappedStatus)) {
        await order.update(
          {
            paymentStatus: 'failed',
          },
          { transaction }
        );
      }
    });

    return {
      received: true,
      orderId: order.id,
      paymentStatus: mappedStatus,
    };
  }

  verifyMercadoPagoSignature(payload, query, headers) {
    const secret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
    if (!secret) return true;

    const xSignature = headers['x-signature'];
    const xRequestId = headers['x-request-id'];
    const dataId = String(query['data.id'] || payload?.data?.id || payload?.id || '').toLowerCase();

    if (!xSignature || !xRequestId || !dataId) {
      throw new AppError('Assinatura do webhook ausente', 401);
    }

    const signatureParts = String(xSignature)
      .split(',')
      .map((part) => part.split('=').map((value) => value.trim()));
    const signatureData = Object.fromEntries(signatureParts);
    const ts = signatureData.ts;
    const receivedHash = signatureData.v1;

    if (!ts || !receivedHash) {
      throw new AppError('Assinatura do webhook inválida', 401);
    }

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expectedHash = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedHash, 'hex');
    const receivedBuffer = Buffer.from(receivedHash, 'hex');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new AppError('Assinatura do webhook inválida', 401);
    }

    return true;
  }

  toPublicSettings(settings) {
    return {
      userId: settings.userId,
      environmentId: settings.environmentId,
      provider: settings.provider,
      acceptsPix: settings.acceptsPix,
      acceptsCreditCard: settings.acceptsCreditCard,
      acceptsDebitCard: settings.acceptsDebitCard,
      acceptsCash: settings.acceptsCash,
      acceptsCardInPerson: settings.acceptsCardInPerson,
      acceptsArrangeWithSeller: settings.acceptsArrangeWithSeller,
      isActive: settings.isActive,
    };
  }

  ensureSeller(requester) {
    if (!['seller', 'admin'].includes(requester.role)) {
      throw new AppError('Apenas vendedores podem configurar pagamentos', 403);
    }
  }
}

module.exports = new PaymentService();
