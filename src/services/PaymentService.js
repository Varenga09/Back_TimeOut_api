const crypto = require('crypto');

const { sequelize, Order, MockTransaction, SellerPayoutAccount, User, Subscription, Plan } = require('../models');
const OrderRepository = require('../repositories/OrderRepository');
const PaymentSettingRepository = require('../repositories/PaymentSettingRepository');
const PaymentTransactionRepository = require('../repositories/PaymentTransactionRepository');
const UserRepository = require('../repositories/UserRepository');
const AppError = require('../utils/AppError');
const MercadoPagoService = require('./MercadoPagoService');
const { isEnvironmentAdmin, isPlatformAdmin } = require('../utils/permissions');
const { calculateCommission } = require('../utils/platformFee');
const { resolveMockTransition } = require('../utils/mockPaymentLifecycle');
const AuditService = require('./AuditService');

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
  getMode() {
    return process.env.PAYMENT_MODE === 'live' ? 'live' : 'mock';
  }

  isMockMode() {
    return this.getMode() === 'mock';
  }

  isOnlinePayment(method) {
    return onlinePaymentMethods.includes(method);
  }

  requiresPayment(method) {
    return this.isMockMode() || this.isOnlinePayment(method);
  }

  requiresConfirmedPayment(order) {
    if (this.isMockMode()) return true;
    return order.paymentProvider === 'mock' || this.isOnlinePayment(order.paymentMethod);
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
      providerAccountId: null,
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

  async ensureConnectedPayoutAccount(sellerId, environmentId, transaction = null) {
    if (!this.isMockMode()) return null;
    const account = await SellerPayoutAccount.findOne({ where: { userId: sellerId, environmentId }, transaction });
    if (!account || account.status !== 'connected') {
      throw new AppError('O vendedor ainda não conectou a conta de recebimento para testes', 400);
    }
    return account;
  }

  async createPaymentForOrder(orderId, externalTransaction = null, providedOrder = null) {
    const order = providedOrder || await OrderRepository.findById(orderId);
    if (order && this.isMockMode()) {
      const createMockPayment = async (transaction) => {
        const existing = await MockTransaction.findOne({
          where: { orderId: order.id },
          order: [['createdAt', 'DESC']],
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (existing) return existing;
        await this.ensureConnectedPayoutAccount(order.sellerId, order.environmentId, transaction);
        const now = new Date();
        const paymentData = {
          orderId: order.id,
          customerId: order.customerId,
          sellerId: order.sellerId,
          environmentId: order.environmentId,
          paymentMethod: order.paymentMethod,
          status: 'pending',
          amount: Number(order.totalPrice),
          grossAmount: Number(order.grossSalesAmount || order.totalPrice),
          commissionRate: Number(order.commissionRate || 0),
          platformFeeAmount: 0,
          sellerNetAmount: 0,
          simulatedAt: now,
          isSimulated: true,
          idempotencyKey: `mock-order-${order.id}`,
          history: [{ status: 'pending', at: now.toISOString(), actorId: order.customerId }],
        };
        const mockPayment = await MockTransaction.create(paymentData, { transaction });

        await Order.update({
          paymentStatus: 'pending',
          paymentProvider: 'mock',
          isPaymentSimulated: true,
          paidAt: null,
        }, { where: { id: order.id }, transaction });

        await AuditService.record({ actorId: order.customerId, action: 'mock_payment.created', resourceType: 'order', resourceId: order.id, environmentId: order.environmentId, summary: 'Pagamento intermediado de teste criado como pendente' }, transaction);

        return mockPayment;
      };
      return externalTransaction
        ? createMockPayment(externalTransaction)
        : sequelize.transaction(createMockPayment);
    }
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

    if (!this.isMockMode() && !this.isOnlinePayment(order.paymentMethod)) {
      throw new AppError('Este pedido não usa pagamento online', 400);
    }

    if (['paid', 'held', 'settled'].includes(order.paymentStatus)) {
      throw new AppError('Este pedido já foi pago', 400);
    }

    return this.createPaymentForOrder(order.id);
  }

  async simulatePayment(orderId, status, requester) {
    if (!this.isMockMode()) {
      throw new AppError('Simulação indisponível fora do ambiente de teste', 400);
    }
    const order = await OrderRepository.findById(orderId);
    if (!order || Number(order.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Pedido não encontrado', 404);
    }
    const isCustomer = Number(order.customerId) === Number(requester.id);
    const isSeller = Number(order.sellerId) === Number(requester.id);
    if (!isCustomer && !isSeller && !isEnvironmentAdmin(requester)) {
      throw new AppError('Você não pode simular o pagamento deste pedido', 403);
    }
    const current = await MockTransaction.findOne({ where: { orderId: order.id }, order: [['createdAt', 'DESC']] });
    if (!current) throw new AppError('Transação simulada não encontrada', 404);
    if (['settled', 'refunded'].includes(current.status)) {
      await this.auditDuplicate(current, requester.id, `simulate_${status}`);
    }
    const action = status === 'approved' ? 'approve' : status === 'declined' ? 'decline' : 'pending';
    const resolvedStatus = resolveMockTransition(current.status, action);
    if (current.status === 'held' && resolvedStatus === 'held') {
      return { transaction: current, order, paymentMode: 'mock' };
    }

    const transaction = await sequelize.transaction(async (dbTransaction) => {
      const payment = await MockTransaction.findByPk(current.id, { lock: dbTransaction.LOCK.UPDATE, transaction: dbTransaction });
      const now = new Date();
      const history = Array.isArray(payment.history) ? [...payment.history] : [];
      const nextStatus = resolvedStatus;
      const updateData = { simulatedAt: now };
      if (status === 'approved') {
        const amounts = calculateCommission(payment.grossAmount || payment.amount, payment.commissionRate);
        history.push({ status: 'approved', at: now.toISOString(), actorId: requester.id });
        history.push({ status: 'held', at: now.toISOString(), actorId: requester.id });
        Object.assign(updateData, { approvedAt: payment.approvedAt || now, heldAt: payment.heldAt || now, platformFeeAmount: amounts.amount, sellerNetAmount: amounts.sellerNetAmount });
      } else {
        history.push({ status, at: now.toISOString(), actorId: requester.id });
        Object.assign(updateData, { platformFeeAmount: 0, sellerNetAmount: 0, approvedAt: null, heldAt: null });
      }
      await payment.update({ ...updateData, status: nextStatus, history }, { transaction: dbTransaction });
      await Order.update({
        paymentStatus: nextStatus,
        paymentProvider: 'mock',
        isPaymentSimulated: true,
        paidAt: nextStatus === 'held' ? now : null,
      }, { where: { id: order.id }, transaction: dbTransaction });
      if (status === 'approved') {
        await AuditService.record({ actorId: requester.id, action: 'mock_payment.approved', resourceType: 'mock_transaction', resourceId: payment.id, environmentId: order.environmentId, summary: 'Pagamento de teste aprovado' }, dbTransaction);
        await AuditService.record({ actorId: requester.id, action: 'mock_payment.held', resourceType: 'mock_transaction', resourceId: payment.id, environmentId: order.environmentId, summary: 'Valor de teste reservado pela plataforma' }, dbTransaction);
      } else {
        await AuditService.record({ actorId: requester.id, action: `mock_payment.${status}`, resourceType: 'mock_transaction', resourceId: payment.id, environmentId: order.environmentId, summary: `Pagamento de teste alterado para ${status}` }, dbTransaction);
      }
      return payment;
    });
    return { transaction, order: await OrderRepository.findById(order.id), paymentMode: 'mock' };
  }

  async settleMockPayment(order, actorId, transaction) {
    if (!this.isMockMode()) return null;
    const payment = await MockTransaction.findOne({ where: { orderId: order.id }, order: [['createdAt', 'DESC']], lock: transaction.LOCK.UPDATE, transaction });
    if (!payment) throw new AppError('Transação simulada não encontrada', 404);
    try {
      resolveMockTransition(payment.status, 'settle');
    } catch (error) {
      if (error.statusCode === 409) await this.auditDuplicate(payment, actorId, 'settlement');
      throw error;
    }
    const now = new Date();
    const amounts = calculateCommission(payment.grossAmount || payment.amount, payment.commissionRate);
    const history = [...(Array.isArray(payment.history) ? payment.history : []), { status: 'settled', at: now.toISOString(), actorId }];
    await payment.update({ status: 'settled', platformFeeAmount: amounts.amount, sellerNetAmount: amounts.sellerNetAmount, settledAt: now, history }, { transaction });
    await order.update({ paymentStatus: 'settled', commissionAmount: amounts.amount, sellerNetRevenue: amounts.sellerNetAmount, commissionConfirmedAt: now, platformFeeAmount: amounts.amount, sellerNetAmount: amounts.sellerNetAmount }, { transaction });
    await AuditService.record({ actorId, action: 'mock_payment.settled', resourceType: 'mock_transaction', resourceId: payment.id, environmentId: order.environmentId, summary: 'Pagamento de teste liquidado após entrega' }, transaction);
    return payment;
  }

  async refundMockPayment(order, actorId, transaction) {
    if (!this.isMockMode()) return null;
    const payment = await MockTransaction.findOne({ where: { orderId: order.id }, order: [['createdAt', 'DESC']], lock: transaction.LOCK.UPDATE, transaction });
    if (!payment) return null;
    try {
      resolveMockTransition(payment.status, 'refund');
    } catch (error) {
      if (error.statusCode === 409) await this.auditDuplicate(payment, actorId, 'refund');
      throw error;
    }
    const now = new Date();
    const history = [...(Array.isArray(payment.history) ? payment.history : []), { status: 'refunded', at: now.toISOString(), actorId }];
    await payment.update({ status: 'refunded', platformFeeAmount: 0, sellerNetAmount: 0, refundedAt: now, history }, { transaction });
    await order.update({ paymentStatus: 'refunded', commissionAmount: 0, sellerNetRevenue: 0, commissionConfirmedAt: null, platformFeeAmount: 0, sellerNetAmount: 0 }, { transaction });
    await AuditService.record({ actorId, action: 'mock_payment.refunded', resourceType: 'mock_transaction', resourceId: payment.id, environmentId: order.environmentId, summary: 'Pagamento de teste reembolsado' }, transaction);
    return payment;
  }

  async auditDuplicate(payment, actorId, operation) {
    return AuditService.record({ actorId, action: 'mock_payment.duplicate_attempt', resourceType: 'mock_transaction', resourceId: payment.id, environmentId: payment.environmentId, summary: `Tentativa duplicada bloqueada: ${operation}` });
  }

  async auditDuplicateForOrder(orderId, actorId, operation) {
    if (!this.isMockMode()) return null;
    const payment = await MockTransaction.findOne({ where: { orderId }, order: [['createdAt', 'DESC']] });
    return payment ? this.auditDuplicate(payment, actorId, operation) : null;
  }

  async connectPayoutAccount(data, requester) {
    this.ensureSeller(requester);
    if (!this.isMockMode()) throw new AppError('Conta de teste disponível somente no modo simulado', 400);
    let account = await SellerPayoutAccount.findOne({ where: { userId: requester.id, environmentId: requester.environmentId } });
    if (account?.status === 'connected') return account;
    const testAccountId = account?.testAccountId || await this.generateTestAccountId();
    const now = new Date();
    const payload = {
      responsibleName: data.responsibleName,
      storeName: data.storeName,
      testAccountId,
      status: 'connected',
      acceptedTestTermsAt: now,
      connectedAt: now,
      suspendedAt: null,
      suspendedBy: null,
    };
    account = account
      ? await account.update(payload)
      : await SellerPayoutAccount.create({ ...payload, userId: requester.id, environmentId: requester.environmentId });
    await AuditService.record({ actorId: requester.id, action: 'payout_account.connected', resourceType: 'seller_payout_account', resourceId: account.id, environmentId: requester.environmentId, summary: 'Conta de recebimento de teste conectada' });
    return account;
  }

  async generateTestAccountId() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = `TEST_SELLER_${String(crypto.randomInt(1, 1000000)).padStart(6, '0')}`;
      if (!await SellerPayoutAccount.findOne({ where: { testAccountId: candidate } })) return candidate;
    }
    throw new AppError('Não foi possível gerar uma identificação de teste', 500);
  }

  summarizeMockTransactions(transactions) {
    const cents = (value) => Math.round(Number(value || 0) * 100);
    const summary = { grossMoved: 0, grossRevenue: 0, heldAmount: 0, commissions: 0, netAvailable: 0, refundedAmount: 0, pendingCount: 0, heldCount: 0, settledCount: 0, declinedCount: 0, refundedCount: 0 };
    for (const item of transactions) {
      const gross = cents(item.grossAmount || item.amount);
      if (item.status === 'pending' || item.status === 'approved') summary.pendingCount += 1;
      if (item.status === 'held') { summary.grossMoved += gross; summary.heldAmount += gross; summary.heldCount += 1; }
      if (item.status === 'settled') {
        summary.grossMoved += gross;
        summary.grossRevenue += gross;
        summary.commissions += cents(item.platformFeeAmount);
        summary.netAvailable += cents(item.sellerNetAmount);
        summary.settledCount += 1;
      }
      if (item.status === 'declined') summary.declinedCount += 1;
      if (item.status === 'refunded') { summary.grossMoved += gross; summary.refundedAmount += gross; summary.refundedCount += 1; }
    }
    return Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, key.endsWith('Count') ? value : value / 100]));
  }

  async getPayoutOverview(requester) {
    this.ensureSeller(requester);
    const [account, subscription, transactions] = await Promise.all([
      SellerPayoutAccount.findOne({ where: { userId: requester.id, environmentId: requester.environmentId } }),
      Subscription.findOne({ where: { userId: requester.id, environmentId: requester.environmentId, status: 'active' }, include: [{ model: Plan, as: 'plan' }] }),
      MockTransaction.findAll({ where: { sellerId: requester.id, environmentId: requester.environmentId }, include: [{ model: Order, as: 'order', attributes: ['id', 'status', 'createdAt'] }], order: [['createdAt', 'DESC']], limit: 100 }),
    ]);
    return { account: account || { status: 'not_connected' }, subscription, summary: this.summarizeMockTransactions(transactions), transactions, paymentMode: this.getMode() };
  }

  async getAdminPayoutOverview(requester) {
    if (!isEnvironmentAdmin(requester)) throw new AppError('Acesso restrito ao administrador do ambiente', 403);
    const [accounts, transactions] = await Promise.all([
      SellerPayoutAccount.findAll({ where: { environmentId: requester.environmentId }, include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'email'] }], order: [['createdAt', 'DESC']] }),
      MockTransaction.findAll({ where: { environmentId: requester.environmentId }, order: [['createdAt', 'DESC']], limit: 200 }),
    ]);
    const sellers = await User.findAll({ where: { environmentId: requester.environmentId, role: 'seller' }, attributes: ['id', 'name', 'email'] });
    const connectedIds = new Set(accounts.filter((account) => account.status === 'connected').map((account) => Number(account.userId)));
    return { accounts, sellersWithoutAccount: sellers.filter((seller) => !connectedIds.has(Number(seller.id))), summary: this.summarizeMockTransactions(transactions), transactions, paymentMode: this.getMode() };
  }

  async getPlatformPayoutOverview(requester) {
    if (!isPlatformAdmin(requester)) throw new AppError('Acesso restrito à equipe TimeOut', 403);
    const [accounts, transactions] = await Promise.all([
      SellerPayoutAccount.findAll({ include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'email'] }], order: [['createdAt', 'DESC']], limit: 500 }),
      MockTransaction.findAll({ order: [['createdAt', 'DESC']], limit: 500 }),
    ]);
    return { accounts, summary: this.summarizeMockTransactions(transactions), transactions, paymentMode: this.getMode() };
  }

  async setPayoutAccountStatus(sellerId, suspended, requester) {
    if (!isEnvironmentAdmin(requester)) throw new AppError('Acesso restrito ao administrador do ambiente', 403);
    const account = await SellerPayoutAccount.findOne({ where: { userId: sellerId, environmentId: requester.environmentId } });
    if (!account) throw new AppError('Conta de recebimento não encontrada neste ambiente', 404);
    await account.update({ status: suspended ? 'suspended' : 'connected', suspendedAt: suspended ? new Date() : null, suspendedBy: suspended ? requester.id : null });
    await AuditService.record({ actorId: requester.id, action: suspended ? 'payout_account.suspended' : 'payout_account.reactivated', resourceType: 'seller_payout_account', resourceId: account.id, environmentId: requester.environmentId, summary: suspended ? 'Conta de recebimento de teste suspensa' : 'Conta de recebimento de teste reativada' });
    return account;
  }

  async handleMercadoPagoWebhook(payload, query = {}, headers = {}) {
    if (this.isMockMode()) {
      return { received: true, ignored: true, reason: 'PAYMENT_MODE_MOCK' };
    }
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
      paymentMode: this.getMode(),
      isSimulated: this.isMockMode(),
    };
  }

  ensureSeller(requester) {
    if (requester.role !== 'seller' && !isEnvironmentAdmin(requester)) {
      throw new AppError('Apenas vendedores podem configurar pagamentos', 403);
    }
  }
}

module.exports = new PaymentService();
