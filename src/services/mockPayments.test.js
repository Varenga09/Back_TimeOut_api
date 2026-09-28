const assert = require('node:assert/strict');
const test = require('node:test');

const { MockTransaction, SellerPayoutAccount } = require('../models');
const PaymentService = require('./PaymentService');
const AuditService = require('./AuditService');
const { connectPayoutAccountSchema } = require('../validations/paymentValidation');
const { resolveMockTransition } = require('../utils/mockPaymentLifecycle');

test('conecta conta simulada sem aceitar dados bancários reais', async () => {
  const originalMode = process.env.PAYMENT_MODE;
  const originals = {
    findOne: SellerPayoutAccount.findOne,
    create: SellerPayoutAccount.create,
    generate: PaymentService.generateTestAccountId,
    audit: AuditService.record,
  };
  process.env.PAYMENT_MODE = 'mock';
  let saved;
  SellerPayoutAccount.findOne = async () => null;
  SellerPayoutAccount.create = async (data) => { saved = { id: 1, ...data }; return saved; };
  PaymentService.generateTestAccountId = async () => 'TEST_SELLER_000123';
  AuditService.record = async () => null;

  try {
    const account = await PaymentService.connectPayoutAccount(
      { responsibleName: 'Maria Teste', storeName: 'Cantina Teste', acceptedTestTerms: true },
      { id: 8, role: 'seller', environmentId: 4 }
    );
    assert.equal(account.status, 'connected');
    assert.equal(account.testAccountId, 'TEST_SELLER_000123');
    assert.equal(saved.userId, 8);
    assert.equal(saved.environmentId, 4);
    assert.equal(Object.hasOwn(saved, 'pixKey'), false);
  } finally {
    process.env.PAYMENT_MODE = originalMode;
    SellerPayoutAccount.findOne = originals.findOne;
    SellerPayoutAccount.create = originals.create;
    PaymentService.generateTestAccountId = originals.generate;
    AuditService.record = originals.audit;
  }
});

test('validação rejeita chave Pix, conta e senha bancária', () => {
  for (const forbiddenField of ['pixKey', 'bank', 'agency', 'account', 'bankAccount', 'cardNumber', 'password']) {
    const { error } = connectPayoutAccountSchema.validate({
      responsibleName: 'Maria Teste',
      storeName: 'Cantina Teste',
      acceptedTestTerms: true,
      [forbiddenField]: 'dado-proibido',
    });
    assert.ok(error, `${forbiddenField} deveria ser rejeitado`);
  }
});

test('máquina de estados cobre aprovação, reserva, pendência, recusa e estorno', () => {
  assert.equal(resolveMockTransition('pending', 'approve'), 'held');
  assert.equal(resolveMockTransition('pending', 'pending'), 'pending');
  assert.equal(resolveMockTransition('pending', 'decline'), 'declined');
  assert.equal(resolveMockTransition('declined', 'approve'), 'held');
  assert.equal(resolveMockTransition('held', 'settle'), 'settled');
  assert.equal(resolveMockTransition('pending', 'refund'), 'refunded');
  assert.equal(resolveMockTransition('held', 'refund'), 'refunded');
});

test('liquidação exige reserva e bloqueia duplicidade', () => {
  assert.throws(() => resolveMockTransition('pending', 'settle'), (error) => error.statusCode === 400);
  assert.throws(() => resolveMockTransition('settled', 'settle'), (error) => error.statusCode === 409);
});

test('reembolso bloqueia duplicidade e pedido já liquidado', () => {
  assert.throws(() => resolveMockTransition('refunded', 'refund'), (error) => error.statusCode === 409);
  assert.throws(() => resolveMockTransition('settled', 'refund'), (error) => error.statusCode === 409);
});

test('pagamento reservado não pode regredir para pendente ou recusado', () => {
  assert.throws(() => resolveMockTransition('held', 'pending'), (error) => error.statusCode === 409);
  assert.throws(() => resolveMockTransition('held', 'decline'), (error) => error.statusCode === 409);
});

test('liquidação usa o percentual salvo na transação mesmo após troca de plano', async () => {
  const originalMode = process.env.PAYMENT_MODE;
  const originals = { findOne: MockTransaction.findOne, audit: AuditService.record };
  process.env.PAYMENT_MODE = 'mock';
  let paymentUpdate;
  let orderUpdate;
  const payment = {
    id: 12,
    status: 'held',
    grossAmount: 100,
    amount: 100,
    commissionRate: 7,
    environmentId: 2,
    history: [],
    update: async (data) => { paymentUpdate = data; },
  };
  const order = {
    id: 20,
    environmentId: 2,
    update: async (data) => { orderUpdate = data; },
  };
  MockTransaction.findOne = async () => payment;
  AuditService.record = async () => null;

  try {
    await PaymentService.settleMockPayment(order, 5, { LOCK: { UPDATE: 'UPDATE' } });
    assert.equal(paymentUpdate.status, 'settled');
    assert.equal(paymentUpdate.platformFeeAmount, 7);
    assert.equal(paymentUpdate.sellerNetAmount, 93);
    assert.equal(orderUpdate.commissionAmount, 7);
  } finally {
    process.env.PAYMENT_MODE = originalMode;
    MockTransaction.findOne = originals.findOne;
    AuditService.record = originals.audit;
  }
});

test('resumo não gera comissão para transações recusadas ou reembolsadas', () => {
  const summary = PaymentService.summarizeMockTransactions([
    { status: 'declined', grossAmount: 20, platformFeeAmount: 2, sellerNetAmount: 18 },
    { status: 'refunded', grossAmount: 30, platformFeeAmount: 3, sellerNetAmount: 27 },
    { status: 'held', grossAmount: 40, platformFeeAmount: 4, sellerNetAmount: 36 },
    { status: 'settled', grossAmount: 100, platformFeeAmount: 7, sellerNetAmount: 93 },
  ]);
  assert.deepEqual(summary, {
    grossMoved: 170,
    grossRevenue: 100,
    heldAmount: 40,
    commissions: 7,
    netAvailable: 93,
    refundedAmount: 30,
    pendingCount: 0,
    heldCount: 1,
    settledCount: 1,
    declinedCount: 1,
    refundedCount: 1,
  });
});

test('conta conectada é isolada por vendedor e ambiente', async () => {
  const originalMode = process.env.PAYMENT_MODE;
  const originalFind = SellerPayoutAccount.findOne;
  process.env.PAYMENT_MODE = 'mock';
  SellerPayoutAccount.findOne = async ({ where }) => (
    Number(where.userId) === 9 && Number(where.environmentId) === 3
      ? { userId: 9, environmentId: 3, status: 'connected' }
      : null
  );
  try {
    await PaymentService.ensureConnectedPayoutAccount(9, 3);
    await assert.rejects(PaymentService.ensureConnectedPayoutAccount(9, 4), (error) => error.statusCode === 400);
    await assert.rejects(PaymentService.ensureConnectedPayoutAccount(10, 3), (error) => error.statusCode === 400);
  } finally {
    process.env.PAYMENT_MODE = originalMode;
    SellerPayoutAccount.findOne = originalFind;
  }
});
