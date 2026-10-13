const test = require('node:test');
const assert = require('node:assert/strict');
const AuthService = require('./AuthService');
const OrderService = require('./OrderService');
const AccountService = require('./AccountAdministrationService');
const UserRepository = require('../repositories/UserRepository');
const EnvironmentRepository = require('../repositories/EnvironmentRepository');
const UserEnvironmentRepository = require('../repositories/UserEnvironmentRepository');
const { Environment, UserEnvironment, User, AuditLog } = require('../models');
const approvedMembershipMiddleware = require('../middlewares/approvedMembershipMiddleware');
const AccessControlService = require('./AccessControlService');
const AuditService = require('./AuditService');
const NotificationService = require('./InternalNotificationService');
const PaymentService = require('./PaymentService');
const { SellerRequest, EnvironmentApplication, AuditLog: AuditLogModel, sequelize } = require('../models');
const fs = require('fs');

test('cadastro sem código não cria participação nem seleciona ambiente', async () => {
  const originalMode = process.env.IDENTITY_VERIFICATION_MODE;
  const originals = { email: UserRepository.findByEmail, create: UserRepository.create, id: UserRepository.findById, membership: UserEnvironmentRepository.createIfMissing, environment: EnvironmentRepository.findByAccessCode };
  let payload;
  let membershipCreated = false;
  process.env.IDENTITY_VERIFICATION_MODE = 'mock';
  UserRepository.findByEmail = async () => null;
  UserRepository.create = async (data) => { payload = data; return { id: 21, ...data }; };
  UserRepository.findById = async () => ({ id: 21, role: 'customer', environmentId: null });
  UserEnvironmentRepository.createIfMissing = async () => { membershipCreated = true; };
  EnvironmentRepository.findByAccessCode = async () => { throw new Error('Código não deveria ser consultado'); };
  try {
    const result = await AuthService.register({ name: 'Teste', email: 'teste@timeout.test', password: 'Senha#123' });
    assert.equal(payload.environmentId, null);
    assert.equal(result.membershipStatus, null);
    assert.equal(membershipCreated, false);
  } finally {
    process.env.IDENTITY_VERIFICATION_MODE = originalMode;
    UserRepository.findByEmail = originals.email;
    UserRepository.create = originals.create;
    UserRepository.findById = originals.id;
    UserEnvironmentRepository.createIfMissing = originals.membership;
    EnvironmentRepository.findByAccessCode = originals.environment;
  }
});

test('catálogo bloqueia contas sem ambiente, pendentes, suspensas ou em ambiente suspenso', async () => {
  const originals = { environment: Environment.findByPk, membership: UserEnvironment.findOne };
  let environmentStatus = 'active';
  let membershipStatus = 'approved';
  Environment.findByPk = async () => ({ status: environmentStatus });
  UserEnvironment.findOne = async () => ({ status: membershipStatus });
  const check = (environmentId) => new Promise((resolve) => approvedMembershipMiddleware({ user: { id: 1, environmentId } }, {}, resolve));
  try {
    assert.equal((await check(null)).statusCode, 403);
    for (const status of ['pending', 'suspended', 'rejected']) {
      membershipStatus = status;
      assert.equal((await check(1)).statusCode, 403);
    }
    membershipStatus = 'approved';
    environmentStatus = 'suspended';
    assert.equal((await check(1)).statusCode, 403);
    environmentStatus = 'active';
    assert.equal(await check(1), undefined);
  } finally {
    Environment.findByPk = originals.environment;
    UserEnvironment.findOne = originals.membership;
  }
});

test('pedido é bloqueado antes de tocar pagamento ou estoque sem participação aprovada', async () => {
  const originals = { environment: Environment.findByPk, membership: UserEnvironment.findOne };
  Environment.findByPk = async () => ({ status: 'active' });
  UserEnvironment.findOne = async () => null;
  try {
    for (const requester of [{ id: 1, environmentId: null }, { id: 1, environmentId: 2 }]) {
      await assert.rejects(OrderService.create({ sellerId: 3, items: [] }, requester), (error) => error.statusCode === 403);
    }
  } finally {
    Environment.findByPk = originals.environment;
    UserEnvironment.findOne = originals.membership;
  }
});

test('pedido de outro ambiente é bloqueado mesmo com participação aprovada; equipe mantém acesso como cliente', async () => {
  const originals = { environment: Environment.findByPk, membership: UserEnvironment.findOne, seller: UserRepository.findById, payment: PaymentService.ensureSellerAcceptsPaymentMethod };
  let paymentReached = false;
  Environment.findByPk = async () => ({ status: 'active' });
  UserEnvironment.findOne = async () => ({ status: 'approved', role: 'customer' });
  UserRepository.findById = async () => ({ id: 3, role: 'seller', environmentId: 9 });
  PaymentService.ensureSellerAcceptsPaymentMethod = async () => { paymentReached = true; };
  try {
    await assert.rejects(OrderService.create({ sellerId: 3, items: [] }, { id: 1, role: 'platform_admin', environmentId: 2 }), (error) => error.statusCode === 404);
    assert.equal(paymentReached, false);
  } finally {
    Environment.findByPk = originals.environment;
    UserEnvironment.findOne = originals.membership;
    UserRepository.findById = originals.seller;
    PaymentService.ensureSellerAcceptsPaymentMethod = originals.payment;
  }
});

test('administrador de ambiente não gerencia contas de outro ambiente', async () => {
  const originals = { user: User.findByPk, membership: UserEnvironment.findOne };
  User.findByPk = async () => ({ id: 4, role: 'customer' });
  UserEnvironment.findOne = async () => null;
  try {
    await assert.rejects(AccountService.detail(4, { id: 2, role: 'environment_admin', environmentId: 1 }), (error) => error.statusCode === 404);
  } finally {
    User.findByPk = originals.user;
    UserEnvironment.findOne = originals.membership;
  }
});

test('respostas administrativas nunca incluem senha, hash, token ou CPF', async () => {
  const originals = { user: User.findByPk, memberships: UserEnvironment.findAll, audits: AuditLog.findAll };
  User.findByPk = async () => ({ id: 4, name: 'Cliente', email: 'x@timeout.test', role: 'customer', password: 'segredo', cpf: '12345678909', tokenVersion: 8 });
  UserEnvironment.findAll = async () => [];
  AuditLog.findAll = async () => [];
  try {
    const result = await AccountService.detail(4, { id: 1, role: 'platform_admin' });
    assert.equal(result.user.password, undefined);
    assert.equal(result.user.cpf, undefined);
    assert.equal(result.user.tokenVersion, undefined);
  } finally { User.findByPk = originals.user; UserEnvironment.findAll = originals.memberships; AuditLog.findAll = originals.audits; }
});

test('consulta de CPF exige motivo e gera auditoria sem registrar o CPF', async () => {
  const originals = { application: EnvironmentApplication.findByPk, audit: AuditService.record };
  const logs = [];
  EnvironmentApplication.findByPk = async () => ({ id: 4, cpf: '12345678909', environmentId: null });
  AuditService.record = async (event) => { logs.push(event); };
  try {
    await assert.rejects(AccessControlService.revealCpf('environment', 4, '', { id: 1, role: 'platform_admin' }), /motivo/);
    const result = await AccessControlService.revealCpf('environment', 4, 'Análise da identidade', { id: 1, role: 'platform_admin' });
    assert.equal(result.cpf, '12345678909');
    assert.equal(logs.length, 1);
    assert.equal(logs[0].metadata.reason, 'Análise da identidade');
    assert.doesNotMatch(JSON.stringify(logs), /12345678909/);
  } finally { EnvironmentApplication.findByPk = originals.application; AuditService.record = originals.audit; }
});

test('consulta de documento exige motivo e registra recurso sem expor conteúdo', async () => {
  const originals = { application: EnvironmentApplication.findByPk, exists: fs.existsSync, audit: AuditService.record };
  let log;
  EnvironmentApplication.findByPk = async () => ({ id: 4, documentPath: 'proof.pdf', environmentId: null });
  fs.existsSync = () => true;
  AuditService.record = async (event) => { log = event; };
  try {
    await assert.rejects(AccessControlService.getEnvironmentApplicationDocument(4, '', { id: 1, role: 'platform_admin' }), /motivo/);
    const file = await AccessControlService.getEnvironmentApplicationDocument(4, 'Verificar vínculo institucional', { id: 1, role: 'platform_admin' });
    assert.match(file, /proof\.pdf$/);
    assert.equal(log.action, 'sensitive.document_viewed');
    assert.equal(log.metadata.reason, 'Verificar vínculo institucional');
  } finally { EnvironmentApplication.findByPk = originals.application; fs.existsSync = originals.exists; AuditService.record = originals.audit; }
});

test('revisão restritiva de vendedor exige justificativa antes de alterar dados', async () => {
  const original = SellerRequest.findByPk;
  SellerRequest.findByPk = async () => ({ id: 4, userId: 9, environmentId: 2 });
  try {
    await assert.rejects(AccessControlService.reviewSellerApplication(4, { status: 'blocked' }, { id: 1, role: 'environment_admin', environmentId: 2 }), /justificativa/);
  } finally { SellerRequest.findByPk = original; }
});

test('solicitação de vendedor aprovada não pode ser recusada retroativamente', async () => {
  const original = SellerRequest.findByPk;
  SellerRequest.findByPk = async () => ({ id: 4, userId: 9, environmentId: 2, status: 'approved' });
  try {
    await assert.rejects(
      AccessControlService.reviewSellerApplication(4, { status: 'rejected', reason: 'Revisão administrativa' }, { id: 1, role: 'environment_admin', environmentId: 2 }),
      (error) => error.statusCode === 409
    );
  } finally { SellerRequest.findByPk = original; }
});

test('administrador com participação suspensa não pode revelar CPF de vendedor', async () => {
  const originals = { application: SellerRequest.findByPk, environment: Environment.findByPk, membership: UserEnvironment.findOne, user: User.findByPk, audit: AuditService.record };
  let audited = false;
  SellerRequest.findByPk = async () => ({ id: 4, userId: 9, environmentId: 2 });
  Environment.findByPk = async () => ({ status: 'active' });
  UserEnvironment.findOne = async () => ({ status: 'suspended', role: 'environment_admin' });
  User.findByPk = async () => ({ cpf: '12345678909' });
  AuditService.record = async () => { audited = true; };
  try {
    await assert.rejects(
      AccessControlService.revealCpf('seller', 4, 'Análise de documento', { id: 1, role: 'environment_admin', environmentId: 2 }),
      (error) => error.statusCode === 403
    );
    assert.equal(audited, false);
  } finally {
    SellerRequest.findByPk = originals.application; Environment.findByPk = originals.environment;
    UserEnvironment.findOne = originals.membership; User.findByPk = originals.user; AuditService.record = originals.audit;
  }
});

test('bloqueio de conta invalida sessões e grava auditoria sem senha', async () => {
  const originals = { transaction: sequelize.transaction, user: User.findByPk, audit: AuditService.record, notify: NotificationService.create, memberships: UserEnvironment.findAll, history: AuditLogModel.findAll };
  const user = { id: 3, role: 'customer', tokenVersion: 2, isSuspended: false, update: async (data) => { Object.assign(user, data); } };
  let audit;
  sequelize.transaction = async (callback) => callback({});
  User.findByPk = async () => user;
  AuditService.record = async (event) => { audit = event; };
  NotificationService.create = async () => {};
  UserEnvironment.findAll = async () => [];
  AuditLogModel.findAll = async () => [];
  try {
    await AccountService.setSuspended(3, true, 'Violação das regras internas', { id: 1, role: 'platform_admin' });
    assert.equal(user.isSuspended, true);
    assert.equal(user.tokenVersion, 3);
    assert.equal(audit.action, 'account.suspended');
    assert.doesNotMatch(JSON.stringify(audit), /password|tokenVersion|cpf/);
  } finally {
    sequelize.transaction = originals.transaction; User.findByPk = originals.user; AuditService.record = originals.audit;
    NotificationService.create = originals.notify; UserEnvironment.findAll = originals.memberships; AuditLogModel.findAll = originals.history;
  }
});
