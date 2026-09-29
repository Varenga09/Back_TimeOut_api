const crypto = require('crypto');
const { Op, fn, literal } = require('sequelize');

const { sequelize, Order, MockTransaction, SellerPayoutAccount, User, Subscription, Plan } = require('../models');
const OrderRepository = require('../repositories/OrderRepository');
const PaymentSettingRepository = require('../repositories/PaymentSettingRepository');
const PaymentTransactionRepository = require('../repositories/PaymentTransactionRepository');
const UserRepository = require('../repositories/UserRepository');
const AppError = require('../utils/AppError');
const MercadoPagoService = require('./MercadoPagoService');
const { isEnvironmentAdmin, isPlatformAdmin } = require('../utils/permissions');
const { calculateCommission } = require('../utils/platformFee');
const { isIdempotentMockTransition, resolveMockTransition } = require('../utils/mockPaymentLifecycle');
const AuditService = require('./AuditService');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');

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
    // Temporary product rule: external payment methods remain unchanged until the product decision is made.
    return this.isMockMode() || this.isOnlinePayment(method);
  }

  requiresConfirmedPayment(order) {
    if (this.isMockMode()) return true;
    return order.paymentProvider === 'mock' || this.isOnlinePayment(order.paymentMethod);
  }

  buildInitialMockPaymentState(order, now = new Date()) {
    const amounts = calculateCommission(
      order.grossSalesAmount || order.totalPrice,
      order.commissionRate
    );

    return {
      status: 'held',
      platformFeeAmount: amounts.amount,
      sellerNetAmount: amounts.sellerNetAmount,
      approvedAt: now,
      heldAt: now,
      history: [
        { status: 'approved', at: now.toISOString(), actorId: order.customerId },
        { status: 'held', at: now.toISOString(), actorId: order.customerId },
      ],
    };
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
        const lockedOrder = await Order.findByPk(order.id, {
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (!lockedOrder) throw new AppError('Pedido não encontrado', 404);
        const existing = await MockTransaction.findOne({
          where: { principalOrderId: lockedOrder.id },
          order: [['createdAt', 'DESC']],
          lock: transaction.LOCK.UPDATE,
          transaction,
        });
        if (existing) return existing;
        await this.ensureConnectedPayoutAccount(lockedOrder.sellerId, lockedOrder.environmentId, transaction);
        const now = new Date();
        const initialState = this.buildInitialMockPaymentState(lockedOrder, now);
        const paymentData = {
          orderId: lockedOrder.id,
          customerId: lockedOrder.customerId,
          sellerId: lockedOrder.sellerId,
          environmentId: lockedOrder.environmentId,
          paymentMethod: lockedOrder.paymentMethod,
          status: initialState.status,
          amount: Number(lockedOrder.totalPrice),
          grossAmount: Number(lockedOrder.grossSalesAmount || lockedOrder.totalPrice),
          commissionRate: Number(lockedOrder.commissionRate || 0),
          platformFeeAmount: initialState.platformFeeAmount,
          sellerNetAmount: initialState.sellerNetAmount,
          simulatedAt: now,
          isSimulated: true,
          idempotencyKey: `mock-order-${lockedOrder.id}`,
          principalOrderId: lockedOrder.id,
          approvedAt: initialState.approvedAt,
          heldAt: initialState.heldAt,
          history: initialState.history,
        };
        const mockPayment = await MockTransaction.create(paymentData, { transaction });

        await Order.update({
          paymentStatus: 'held',
          paymentProvider: 'mock',
          isPaymentSimulated: true,
          paidAt: now,
        }, { where: { id: lockedOrder.id }, transaction });

        await AuditService.record({ actorId: lockedOrder.customerId, action: 'mock_payment.created', resourceType: 'order', resourceId: lockedOrder.id, environmentId: lockedOrder.environmentId, summary: 'Pagamento intermediado de teste aprovado automaticamente e reservado' }, transaction);

        return mockPayment;
      };
      if (externalTransaction) return createMockPayment(externalTransaction);
      try {
        return await sequelize.transaction(createMockPayment);
      } catch (error) {
        if (error.name !== 'SequelizeUniqueConstraintError') throw error;
        const existing = await MockTransaction.findOne({ where: { principalOrderId: order.id } });
        if (existing) return existing;
        throw error;
      }
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
    const action = status === 'approved' ? 'approve' : status === 'declined' ? 'decline' : 'pending';
    try {
      const transaction = await sequelize.transaction(async (dbTransaction) => {
        const lockedOrder = await Order.findByPk(order.id, { lock: dbTransaction.LOCK.UPDATE, transaction: dbTransaction });
        const payment = await MockTransaction.findOne({ where: { principalOrderId: order.id }, lock: dbTransaction.LOCK.UPDATE, transaction: dbTransaction });
        if (!payment) throw new AppError('Transação simulada não encontrada', 404);

        const nextStatus = resolveMockTransition(payment.status, action);
        if (isIdempotentMockTransition(payment.status, action)) {
          await this.auditDuplicate(payment, requester.id, `simulate_${status}`, dbTransaction);
          return payment;
        }

        const now = new Date();
        const history = Array.isArray(payment.history) ? [...payment.history] : [];
        const updateData = { simulatedAt: now };
        if (status === 'approved') {
          const amounts = calculateCommission(payment.grossAmount || payment.amount, payment.commissionRate);
          history.push({ status: 'approved', at: now.toISOString(), actorId: requester.id });
          history.push({ status: 'held', at: now.toISOString(), actorId: requester.id });
          Object.assign(updateData, { approvedAt: now, heldAt: now, platformFeeAmount: amounts.amount, sellerNetAmount: amounts.sellerNetAmount });
        } else {
          history.push({ status, at: now.toISOString(), actorId: requester.id });
          Object.assign(updateData, { platformFeeAmount: 0, sellerNetAmount: 0, approvedAt: null, heldAt: null });
        }
        await payment.update({ ...updateData, status: nextStatus, history }, { transaction: dbTransaction });
        await lockedOrder.update({ paymentStatus: nextStatus, paymentProvider: 'mock', isPaymentSimulated: true, paidAt: nextStatus === 'held' ? now : null }, { transaction: dbTransaction });
        if (status === 'approved') {
          await AuditService.record({ actorId: requester.id, action: 'mock_payment.approved', resourceType: 'mock_transaction', resourceId: payment.id, environmentId: lockedOrder.environmentId, summary: 'Pagamento de teste aprovado' }, dbTransaction);
          await AuditService.record({ actorId: requester.id, action: 'mock_payment.held', resourceType: 'mock_transaction', resourceId: payment.id, environmentId: lockedOrder.environmentId, summary: 'Valor de teste reservado pela plataforma' }, dbTransaction);
        } else {
          await AuditService.record({ actorId: requester.id, action: `mock_payment.${status}`, resourceType: 'mock_transaction', resourceId: payment.id, environmentId: lockedOrder.environmentId, summary: `Pagamento de teste alterado para ${status}` }, dbTransaction);
        }
        return payment;
      });
      return { transaction, order: await OrderRepository.findById(order.id), paymentMode: 'mock' };
    } catch (error) {
      if (error.statusCode === 409) await this.auditDuplicateForOrder(order.id, requester.id, `simulate_${status}`);
      throw error;
    }
  }

  async settleMockPayment(order, actorId, transaction) {
    if (!this.isMockMode()) return null;
    const payment = await MockTransaction.findOne({ where: { principalOrderId: order.id }, lock: transaction.LOCK.UPDATE, transaction });
    if (!payment) throw new AppError('Transação simulada não encontrada', 404);
    const nextStatus = resolveMockTransition(payment.status, 'settle');
    if (isIdempotentMockTransition(payment.status, 'settle')) {
      await this.auditDuplicate(payment, actorId, 'settlement', transaction);
      return { payment, idempotent: true, blocked: false };
    }

    const account = await SellerPayoutAccount.findOne({
      where: { userId: order.sellerId, environmentId: order.environmentId },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    const now = new Date();
    if (!account || account.status !== 'connected') {
      const reason = account
        ? `Conta de recebimento com status ${account.status}`
        : 'Conta de recebimento não encontrada';
      const history = [...(Array.isArray(payment.history) ? payment.history : []), { status: 'held', event: 'settlement_blocked', reason, at: now.toISOString(), actorId }];
      await payment.update({ settlementBlockedAt: now, settlementBlockedReason: reason, history }, { transaction });
      await order.update({ paymentStatus: 'held', commissionAmount: 0, sellerNetRevenue: 0, commissionConfirmedAt: null, platformFeeAmount: 0, sellerNetAmount: 0 }, { transaction });
      await AuditService.record({ actorId, action: 'mock_payment.settlement_blocked', resourceType: 'mock_transaction', resourceId: payment.id, environmentId: order.environmentId, summary: `Liquidação retida: ${reason}` }, transaction);
      return { payment, idempotent: false, blocked: true, reason };
    }

    const amounts = calculateCommission(payment.grossAmount || payment.amount, payment.commissionRate);
    const history = [...(Array.isArray(payment.history) ? payment.history : []), { status: 'settled', at: now.toISOString(), actorId }];
    await payment.update({ status: nextStatus, platformFeeAmount: amounts.amount, sellerNetAmount: amounts.sellerNetAmount, settledAt: now, settlementBlockedAt: null, settlementBlockedReason: null, settlementReleasedBy: actorId, history }, { transaction });
    await order.update({ paymentStatus: 'settled', commissionAmount: amounts.amount, sellerNetRevenue: amounts.sellerNetAmount, commissionConfirmedAt: now, platformFeeAmount: amounts.amount, sellerNetAmount: amounts.sellerNetAmount }, { transaction });
    await AuditService.record({ actorId, action: 'mock_payment.settled', resourceType: 'mock_transaction', resourceId: payment.id, environmentId: order.environmentId, summary: 'Pagamento de teste liquidado após entrega' }, transaction);
    return { payment, idempotent: false, blocked: false };
  }

  async refundMockPayment(order, actorId, transaction) {
    if (!this.isMockMode()) return null;
    const payment = await MockTransaction.findOne({ where: { principalOrderId: order.id }, lock: transaction.LOCK.UPDATE, transaction });
    if (!payment) return null;
    const nextStatus = resolveMockTransition(payment.status, 'refund');
    if (isIdempotentMockTransition(payment.status, 'refund')) {
      await this.auditDuplicate(payment, actorId, 'refund', transaction);
      return { payment, idempotent: true };
    }
    const now = new Date();
    const history = [...(Array.isArray(payment.history) ? payment.history : []), { status: 'refunded', at: now.toISOString(), actorId }];
    await payment.update({ status: nextStatus, platformFeeAmount: 0, sellerNetAmount: 0, refundedAt: now, settlementBlockedAt: null, settlementBlockedReason: null, history }, { transaction });
    await order.update({ paymentStatus: 'refunded', commissionAmount: 0, sellerNetRevenue: 0, commissionConfirmedAt: null, platformFeeAmount: 0, sellerNetAmount: 0 }, { transaction });
    await AuditService.record({ actorId, action: 'mock_payment.refunded', resourceType: 'mock_transaction', resourceId: payment.id, environmentId: order.environmentId, summary: 'Pagamento de teste reembolsado' }, transaction);
    return { payment, idempotent: false };
  }

  async auditDuplicate(payment, actorId, operation, transaction = null) {
    return AuditService.record({ actorId, action: 'mock_payment.duplicate_attempt', resourceType: 'mock_transaction', resourceId: payment.id, environmentId: payment.environmentId, summary: `Tentativa idempotente ou conflitante: ${operation}` }, transaction);
  }

  async auditDuplicateForOrder(orderId, actorId, operation) {
    if (!this.isMockMode()) return null;
    const payment = await MockTransaction.findOne({ where: { principalOrderId: orderId } });
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

  buildFinancialWhere(scope, query = {}) {
    const where = { principalOrderId: { [Op.ne]: null }, ...scope };
    if (query.status) where.status = query.status;
    if (query.dateFrom || query.dateTo) {
      where.createdAt = {};
      if (query.dateFrom) where.createdAt[Op.gte] = new Date(`${query.dateFrom}T00:00:00.000Z`);
      if (query.dateTo) where.createdAt[Op.lte] = new Date(`${query.dateTo}T23:59:59.999Z`);
    }
    return where;
  }

  async calculateFinancialSummary(scope, query = {}) {
    const q = (name) => sequelize.getQueryInterface().quoteIdentifier(name);
    const status = q('status');
    const gross = q('grossAmount');
    const fee = q('platformFeeAmount');
    const net = q('sellerNetAmount');
    const sumCase = (condition, column = '1') => fn('COALESCE', fn('SUM', literal(`CASE WHEN ${condition} THEN ${column} ELSE 0 END`)), 0);
    const row = await MockTransaction.findOne({
      where: this.buildFinancialWhere(scope, query),
      attributes: [
        [sumCase(`${status} IN ('held','settled','refunded')`, gross), 'grossMoved'],
        [sumCase(`${status} = 'settled'`, gross), 'grossRevenue'],
        [sumCase(`${status} = 'held'`, gross), 'heldAmount'],
        [sumCase(`${status} = 'settled'`, fee), 'commissions'],
        [sumCase(`${status} = 'settled'`, net), 'netAvailable'],
        [sumCase(`${status} = 'refunded'`, gross), 'refundedAmount'],
        [sumCase(`${status} IN ('pending','approved')`), 'pendingCount'],
        [sumCase(`${status} = 'held'`), 'heldCount'],
        [sumCase(`${status} = 'settled'`), 'settledCount'],
        [sumCase(`${status} = 'declined'`), 'declinedCount'],
        [sumCase(`${status} = 'refunded'`), 'refundedCount'],
      ],
      raw: true,
    });
    const countFields = new Set(['pendingCount', 'heldCount', 'settledCount', 'declinedCount', 'refundedCount']);
    return Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key, countFields.has(key) ? Number(value || 0) : Number(Number(value || 0).toFixed(2))]));
  }

  async listFinancialHistory(scope, query = {}, includeSeller = false) {
    const { page, limit, offset } = getPagination(query);
    const include = [{ model: Order, as: 'order', attributes: ['id', 'status', 'createdAt'] }];
    if (includeSeller) include.push({ model: User, as: 'seller', attributes: ['id', 'name', 'email'] });
    const { count, rows } = await MockTransaction.findAndCountAll({
      where: this.buildFinancialWhere(scope, query),
      include,
      limit,
      offset,
      distinct: true,
      order: [['createdAt', query.order === 'asc' ? 'ASC' : 'DESC']],
    });
    return { transactions: rows, ...buildPaginationMeta({ count, page, limit }) };
  }

  async getPayoutOverview(requester, query = {}) {
    this.ensureSeller(requester);
    const scope = { sellerId: requester.id, environmentId: requester.environmentId };
    const [account, subscription, summary, history] = await Promise.all([
      SellerPayoutAccount.findOne({ where: { userId: requester.id, environmentId: requester.environmentId } }),
      Subscription.findOne({ where: { userId: requester.id, environmentId: requester.environmentId, status: 'active' }, include: [{ model: Plan, as: 'plan' }] }),
      this.calculateFinancialSummary(scope, query),
      this.listFinancialHistory(scope, query),
    ]);
    return { account: account || { status: 'not_connected' }, subscription, summary, ...history, paymentMode: this.getMode() };
  }

  async getAdminPayoutOverview(requester, query = {}) {
    if (!isEnvironmentAdmin(requester)) throw new AppError('Acesso restrito ao administrador do ambiente', 403);
    const scope = { environmentId: requester.environmentId };
    const [accounts, summary, history] = await Promise.all([
      SellerPayoutAccount.findAll({ where: { environmentId: requester.environmentId }, include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'email'] }], order: [['createdAt', 'DESC']] }),
      this.calculateFinancialSummary(scope, query),
      this.listFinancialHistory(scope, query, true),
    ]);
    const sellers = await User.findAll({ where: { environmentId: requester.environmentId, role: 'seller' }, attributes: ['id', 'name', 'email'] });
    const connectedIds = new Set(accounts.filter((account) => account.status === 'connected').map((account) => Number(account.userId)));
    return { accounts, sellersWithoutAccount: sellers.filter((seller) => !connectedIds.has(Number(seller.id))), summary, ...history, paymentMode: this.getMode() };
  }

  async getPlatformPayoutOverview(requester, query = {}) {
    if (!isPlatformAdmin(requester)) throw new AppError('Acesso restrito à equipe Time Out', 403);
    const scope = query.environmentId ? { environmentId: query.environmentId } : {};
    const [accounts, summary, history] = await Promise.all([
      SellerPayoutAccount.findAll({ where: scope, include: [{ model: User, as: 'seller', attributes: ['id', 'name', 'email'] }], order: [['createdAt', 'DESC']] }),
      this.calculateFinancialSummary(scope, query),
      this.listFinancialHistory(scope, query, true),
    ]);
    return { accounts, summary, ...history, paymentMode: this.getMode() };
  }

  async setPayoutAccountStatus(sellerId, suspended, requester) {
    if (!isEnvironmentAdmin(requester) && !isPlatformAdmin(requester)) throw new AppError('Acesso restrito à administração', 403);
    return sequelize.transaction(async (transaction) => {
      const where = { userId: sellerId, ...(isEnvironmentAdmin(requester) && { environmentId: requester.environmentId }) };
      const account = await SellerPayoutAccount.findOne({ where, lock: transaction.LOCK.UPDATE, transaction });
      if (!account) throw new AppError('Conta de recebimento não encontrada no escopo permitido', 404);
      await account.update({ status: suspended ? 'suspended' : 'connected', suspendedAt: suspended ? new Date() : null, suspendedBy: suspended ? requester.id : null }, { transaction });
      await AuditService.record({ actorId: requester.id, action: suspended ? 'payout_account.suspended' : 'payout_account.reactivated', resourceType: 'seller_payout_account', resourceId: account.id, environmentId: account.environmentId, summary: suspended ? 'Conta de recebimento de teste suspensa' : 'Conta de recebimento de teste reativada' }, transaction);
      return account;
    });
  }

  async retrySettlement(orderId, requester) {
    if (!isEnvironmentAdmin(requester) && !isPlatformAdmin(requester)) {
      throw new AppError('Apenas administradores podem liberar recebimentos retidos', 403);
    }
    try {
      const result = await sequelize.transaction(async (transaction) => {
        const order = await Order.findByPk(orderId, { lock: transaction.LOCK.UPDATE, transaction });
        if (!order || (isEnvironmentAdmin(requester) && Number(order.environmentId) !== Number(requester.environmentId))) {
          throw new AppError('Pedido não encontrado no escopo permitido', 404);
        }
        if (order.status !== 'delivered') throw new AppError('Somente pedidos entregues podem ter a liquidação repetida', 400);
        return this.settleMockPayment(order, requester.id, transaction);
      });
      return { ...result, order: await OrderRepository.findById(orderId) };
    } catch (error) {
      if (error.statusCode === 409) await this.auditDuplicateForOrder(orderId, requester.id, 'admin_retry_settlement');
      throw error;
    }
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
