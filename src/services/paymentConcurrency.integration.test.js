const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true';
const integrationTest = enabled ? test : test.skip;

const {
  sequelize,
  AuditLog,
  Category,
  Environment,
  MockTransaction,
  Notification,
  Order,
  OrderItem,
  Product,
  SellerPayoutAccount,
  User,
} = require('../models');
const EnvironmentRepository = require('../repositories/EnvironmentRepository');
const AccessControlService = require('./AccessControlService');
const OrderService = require('./OrderService');
const PaymentService = require('./PaymentService');
const userRoutes = require('../routes/userRoutes');

let environment;
let otherEnvironment;
let customer;
let seller;
let admin;
let otherAdmin;
let platformAdmin;
let category;
let product;
let sequence = 0;

const actor = (user) => ({ id: user.id, role: user.role, environmentId: user.environmentId });

async function createOrderWithPayment({ paymentStatus = 'pending', paymentState = 'pending', status = 'pending', gross = 20, withItem = false } = {}) {
  sequence += 1;
  const order = await Order.create({
    customerId: customer.id,
    sellerId: seller.id,
    environmentId: environment.id,
    status,
    totalPrice: gross,
    grossSalesAmount: gross,
    commissionRate: 7,
    commissionAmount: 0,
    sellerNetRevenue: 0,
    paymentMethod: 'pix',
    paymentStatus,
    paymentProvider: 'mock',
    isPaymentSimulated: true,
    deliveryType: 'pickup',
  });
  if (withItem) {
    await OrderItem.create({ orderId: order.id, productId: product.id, quantity: 1, unitPrice: gross, subtotal: gross });
  }
  const payment = await MockTransaction.create({
    orderId: order.id,
    principalOrderId: order.id,
    customerId: customer.id,
    sellerId: seller.id,
    environmentId: environment.id,
    paymentMethod: 'pix',
    status: paymentState,
    amount: gross,
    grossAmount: gross,
    commissionRate: 7,
    platformFeeAmount: paymentState === 'held' ? Number((gross * 0.07).toFixed(2)) : 0,
    sellerNetAmount: paymentState === 'held' ? Number((gross * 0.93).toFixed(2)) : 0,
    simulatedAt: new Date(),
    idempotencyKey: `integration-${Date.now()}-${sequence}`,
    history: [{ status: paymentState, at: new Date().toISOString(), actorId: customer.id }],
  });
  return { order, payment };
}

before(async () => {
  if (!enabled) return;
  process.env.PAYMENT_MODE = 'mock';
  await sequelize.authenticate();

  const legacy = await Environment.unscoped().findOne({ where: { name: 'Ambiente legado' } });
  assert.ok(legacy, 'a fixture legada deve sobreviver à migration');
  assert.equal(legacy.accessCode, null, 'o código em texto aberto deve ser limpo');
  assert.ok(await EnvironmentRepository.findByAccessCode('legacy2026'), 'o código legado deve funcionar pelo hash');
  const legacyNotification = await Notification.findOne({ where: { title: 'Ambiente aprovado' } });
  assert.equal(legacyNotification.message.includes('LEGACY2026'), false, 'notificações legadas devem ser saneadas');

  environment = await Environment.unscoped().create({ name: 'Integração principal', type: 'school', accessCode: null, status: 'active' });
  otherEnvironment = await Environment.unscoped().create({ name: 'Integração externa', type: 'office', accessCode: null, status: 'active' });
  customer = await User.create({ name: 'Cliente Teste', email: 'customer.integration@timeout.test', password: 'Strong#Pass123', role: 'customer', environmentId: environment.id, emailVerifiedAt: new Date() });
  seller = await User.create({ name: 'Vendedor Teste', email: 'seller.integration@timeout.test', password: 'Strong#Pass123', role: 'seller', environmentId: environment.id, emailVerifiedAt: new Date() });
  admin = await User.create({ name: 'Admin Teste', email: 'admin.integration@timeout.test', password: 'Strong#Pass123', role: 'environment_admin', environmentId: environment.id, emailVerifiedAt: new Date() });
  otherAdmin = await User.create({ name: 'Outro Admin', email: 'other.admin.integration@timeout.test', password: 'Strong#Pass123', role: 'environment_admin', environmentId: otherEnvironment.id, emailVerifiedAt: new Date() });
  platformAdmin = await User.create({ name: 'Equipe Teste', email: 'platform.integration@timeout.test', password: 'Strong#Pass123', role: 'platform_admin', environmentId: null, emailVerifiedAt: new Date() });
  category = await Category.create({ name: `Integração ${Date.now()}` });
  product = await Product.create({ name: 'Produto concorrente', price: 20, quantity: 100, isActive: true, userId: seller.id, categoryId: category.id, environmentId: environment.id });
  await SellerPayoutAccount.create({ userId: seller.id, environmentId: environment.id, responsibleName: seller.name, storeName: 'Loja Teste', testAccountId: `TEST_INT_${Date.now()}`, status: 'connected', acceptedTestTermsAt: new Date(), connectedAt: new Date() });
});

after(async () => {
  if (enabled) await sequelize.close();
});

integrationTest('duas aprovações simultâneas mantêm uma transação e uma única reserva', async () => {
  const { order } = await createOrderWithPayment();
  const results = await Promise.all([
    PaymentService.simulatePayment(order.id, 'approved', actor(customer)),
    PaymentService.simulatePayment(order.id, 'approved', actor(customer)),
  ]);
  assert.equal(results.length, 2);
  const payments = await MockTransaction.findAll({ where: { orderId: order.id } });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].status, 'held');
  assert.equal(payments[0].history.filter((item) => item.status === 'held').length, 1);
  assert.ok(await AuditLog.count({ where: { resourceId: String(payments[0].id), action: 'mock_payment.duplicate_attempt' } }));
});

integrationTest('aprovação e recusa simultâneas permitem somente a primeira transição válida', async () => {
  const { order } = await createOrderWithPayment();
  const results = await Promise.allSettled([
    PaymentService.simulatePayment(order.id, 'approved', actor(customer)),
    PaymentService.simulatePayment(order.id, 'declined', actor(customer)),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(results.filter((item) => item.status === 'rejected').length, 1);
  const payment = await MockTransaction.findOne({ where: { principalOrderId: order.id } });
  assert.ok(['held', 'declined'].includes(payment.status));
});

integrationTest('duas liquidações simultâneas liquidam uma vez e a repetição é idempotente', async () => {
  const { order } = await createOrderWithPayment({ status: 'delivered', paymentStatus: 'held', paymentState: 'held' });
  await Promise.all([
    PaymentService.retrySettlement(order.id, actor(admin)),
    PaymentService.retrySettlement(order.id, actor(admin)),
  ]);
  const payment = await MockTransaction.findOne({ where: { principalOrderId: order.id } });
  assert.equal(payment.status, 'settled');
  assert.equal(payment.history.filter((item) => item.status === 'settled').length, 1);
});

integrationTest('liquidação e reembolso simultâneos não finalizam o mesmo pedido duas vezes', async () => {
  const { order } = await createOrderWithPayment({ paymentStatus: 'held', paymentState: 'held', withItem: true });
  const results = await Promise.allSettled([
    OrderService.updateStatus(order.id, 'delivered', actor(seller)),
    OrderService.cancel(order.id, actor(customer)),
  ]);
  assert.equal(results.filter((item) => item.status === 'fulfilled').length, 1);
  const savedOrder = await Order.findByPk(order.id);
  const payment = await MockTransaction.findOne({ where: { principalOrderId: order.id } });
  assert.ok((savedOrder.status === 'delivered' && payment.status === 'settled') || (savedOrder.status === 'canceled' && payment.status === 'refunded'));
});

integrationTest('dois reembolsos simultâneos devolvem o estoque uma única vez', async () => {
  await product.reload();
  const initialQuantity = Number(product.quantity);
  const { order } = await createOrderWithPayment({ paymentStatus: 'held', paymentState: 'held', withItem: true });
  await Promise.all([OrderService.cancel(order.id, actor(customer)), OrderService.cancel(order.id, actor(customer))]);
  await product.reload();
  assert.equal(Number(product.quantity), initialQuantity + 1);
  const payment = await MockTransaction.findOne({ where: { principalOrderId: order.id } });
  assert.equal(payment.history.filter((item) => item.status === 'refunded').length, 1);
});

integrationTest('chave principal impede duas transações financeiras para o mesmo pedido', async () => {
  sequence += 1;
  const order = await Order.create({ customerId: customer.id, sellerId: seller.id, environmentId: environment.id, status: 'pending', totalPrice: 10, grossSalesAmount: 10, commissionRate: 7, paymentMethod: 'pix', paymentStatus: 'pending', paymentProvider: 'mock', isPaymentSimulated: true, deliveryType: 'pickup' });
  await Promise.all([PaymentService.createPaymentForOrder(order.id), PaymentService.createPaymentForOrder(order.id)]);
  assert.equal(await MockTransaction.count({ where: { principalOrderId: order.id } }), 1);
});

integrationTest('conta suspensa retém a liquidação até uma reativação administrativa', async () => {
  const account = await SellerPayoutAccount.findOne({ where: { userId: seller.id, environmentId: environment.id } });
  await account.update({ status: 'suspended', suspendedAt: new Date(), suspendedBy: admin.id });
  const { order } = await createOrderWithPayment({ paymentStatus: 'held', paymentState: 'held' });
  await OrderService.updateStatus(order.id, 'delivered', actor(seller));
  let payment = await MockTransaction.findOne({ where: { principalOrderId: order.id } });
  let savedOrder = await Order.findByPk(order.id);
  assert.equal(payment.status, 'held');
  assert.ok(payment.settlementBlockedAt);
  assert.equal(Number(savedOrder.commissionAmount), 0);
  assert.equal(Number(savedOrder.sellerNetRevenue), 0);
  await assert.rejects(PaymentService.retrySettlement(order.id, actor(seller)), (error) => error.statusCode === 403);
  await assert.rejects(PaymentService.retrySettlement(order.id, actor(otherAdmin)), (error) => error.statusCode === 404);
  await PaymentService.setPayoutAccountStatus(seller.id, false, actor(admin));
  await PaymentService.retrySettlement(order.id, actor(admin));
  await PaymentService.retrySettlement(order.id, actor(platformAdmin));
  payment = await MockTransaction.findOne({ where: { principalOrderId: order.id } });
  savedOrder = await Order.findByPk(order.id);
  assert.equal(payment.status, 'settled');
  assert.equal(payment.settlementBlockedReason, null);
  assert.equal(Number(savedOrder.commissionAmount), 1.4);
  assert.equal(Number(savedOrder.sellerNetRevenue), 18.6);
  assert.equal(payment.history.filter((item) => item.status === 'settled').length, 1);
});

integrationTest('código é buscado por hash, rotacionado e nunca volta nas consultas', async () => {
  const legacy = await Environment.unscoped().findOne({ where: { name: 'Ambiente legado' } });
  const legacyAdmin = await User.create({ name: 'Admin legado', email: 'legacy.admin@timeout.test', password: 'Strong#Pass123', role: 'environment_admin', environmentId: legacy.id, emailVerifiedAt: new Date() });
  const generated = await AccessControlService.rotateAccessCode(actor(legacyAdmin));
  assert.equal(await EnvironmentRepository.findByAccessCode('LEGACY2026'), null);
  assert.equal((await EnvironmentRepository.findByAccessCode(generated.accessCode)).id, legacy.id);
  const raw = await Environment.unscoped().findByPk(legacy.id);
  assert.equal(raw.accessCode, null);
  const dashboard = await AccessControlService.getEnvironmentDashboard(actor(legacyAdmin));
  assert.match(dashboard.accessCode.codePreview, /^\*\*\*\*....$/);
  assert.notEqual(dashboard.accessCode.codePreview, generated.accessCode);
  assert.equal(await Notification.count({ where: { message: { [require('sequelize').Op.like]: `%${generated.accessCode}%` } } }), 0);
  assert.equal(await AuditLog.count({ where: { summary: { [require('sequelize').Op.like]: `%${generated.accessCode}%` } } }), 0);
});

integrationTest('resumo usa todos os registros e não muda com a paginação ou outro ambiente', async () => {
  const totalsSeller = await User.create({ name: 'Vendedor Totais', email: 'totals.integration@timeout.test', password: 'Strong#Pass123', role: 'seller', environmentId: environment.id, emailVerifiedAt: new Date() });
  await SellerPayoutAccount.create({ userId: totalsSeller.id, environmentId: environment.id, responsibleName: totalsSeller.name, storeName: 'Totais', testAccountId: `TEST_TOTAL_${Date.now()}`, status: 'connected', acceptedTestTermsAt: new Date(), connectedAt: new Date() });
  const marker = new Date(Date.now() - 1000);
  for (let index = 0; index < 12; index += 1) {
    const { order, payment } = await createOrderWithPayment({ status: 'delivered', paymentStatus: 'settled', paymentState: 'settled', gross: 0.1 });
    await order.update({ sellerId: totalsSeller.id });
    await payment.update({ sellerId: totalsSeller.id });
  }
  const firstPage = await PaymentService.getPayoutOverview(actor(totalsSeller), { page: 1, limit: 5, dateFrom: marker.toISOString().slice(0, 10), order: 'asc' });
  const secondPage = await PaymentService.getPayoutOverview(actor(totalsSeller), { page: 2, limit: 5, dateFrom: marker.toISOString().slice(0, 10), order: 'asc' });
  assert.equal(firstPage.transactions.length, 5);
  assert.equal(firstPage.total, 12);
  assert.equal(firstPage.totalPages, 3);
  assert.equal(firstPage.summary.settledCount, 12);
  assert.equal(firstPage.summary.grossRevenue, 1.2);
  assert.deepEqual(secondPage.summary, firstPage.summary);
  const otherScope = await PaymentService.getAdminPayoutOverview(actor(otherAdmin), { page: 1, limit: 5 });
  assert.equal(otherScope.summary.grossMoved, 0);
});

integrationTest('rota de autopromoção não existe mais', () => {
  const paths = userRoutes.stack.map((layer) => layer.route?.path).filter(Boolean);
  assert.equal(paths.includes('/me/admin'), false);
});
