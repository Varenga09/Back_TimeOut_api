const test = require('node:test');
const assert = require('node:assert/strict');

const AuthService = require('./AuthService');
const AccessControlService = require('./AccessControlService');
const EnvironmentRepository = require('../repositories/EnvironmentRepository');
const UserRepository = require('../repositories/UserRepository');
const UserEnvironmentRepository = require('../repositories/UserEnvironmentRepository');
const { SellerRequest } = require('../models');
const { generateEnvironmentAccessCode, hashEnvironmentAccessCode, maskCpf } = require('../utils/security');
const { isEnvironmentAdmin, isPlatformAdmin } = require('../utils/permissions');

test('cadastro público sempre cria cliente e não envia confirmação externa no modo mock', async () => {
  const originalMode = process.env.IDENTITY_VERIFICATION_MODE;
  const originals = {
    findEnvironment: EnvironmentRepository.findByAccessCode,
    findEmail: UserRepository.findByEmail,
    createUser: UserRepository.create,
    findId: UserRepository.findById,
    createMembership: UserEnvironmentRepository.createIfMissing,
  };
  let createdUser;
  let membership;
  process.env.IDENTITY_VERIFICATION_MODE = 'mock';
  EnvironmentRepository.findByAccessCode = async () => ({ id: 7, isPrivate: true, accessCodeEnabled: true, status: 'active' });
  UserRepository.findByEmail = async () => null;
  UserRepository.create = async (data) => { createdUser = { id: 22, ...data }; return createdUser; };
  UserRepository.findById = async () => createdUser;
  UserEnvironmentRepository.createIfMissing = async (...args) => { membership = args; };

  try {
    const result = await AuthService.register({ name: 'Cliente', email: 'cliente@example.com', password: 'Senha#123', environmentAccessCode: 'TO-TESTE' });
    assert.equal(createdUser.role, 'customer');
    assert.equal(createdUser.environmentId, null);
    assert.deepEqual(membership, [22, 7, 'customer', 'pending']);
    assert.equal(result.membershipStatus, 'pending');
    assert.equal(result.verificationReason, 'IDENTITY_VERIFICATION_MOCK');
  } finally {
    process.env.IDENTITY_VERIFICATION_MODE = originalMode;
    EnvironmentRepository.findByAccessCode = originals.findEnvironment;
    UserRepository.findByEmail = originals.findEmail;
    UserRepository.create = originals.createUser;
    UserRepository.findById = originals.findId;
    UserEnvironmentRepository.createIfMissing = originals.createMembership;
  }
});

test('administrador não pode aprovar a própria solicitação de vendedor', async () => {
  const original = SellerRequest.findByPk;
  SellerRequest.findByPk = async () => ({ id: 3, userId: 9, environmentId: 2 });
  try {
    await assert.rejects(
      AccessControlService.reviewSellerApplication(3, { status: 'approved' }, { id: 9, role: 'environment_admin', environmentId: 2 }),
      (error) => error.statusCode === 403 && /própria solicitação/.test(error.message)
    );
  } finally {
    SellerRequest.findByPk = original;
  }
});

test('administrador de outro ambiente não pode revisar solicitação', async () => {
  const original = SellerRequest.findByPk;
  SellerRequest.findByPk = async () => ({ id: 3, userId: 10, environmentId: 5 });
  try {
    await assert.rejects(
      AccessControlService.reviewSellerApplication(3, { status: 'approved' }, { id: 9, role: 'environment_admin', environmentId: 2 }),
      (error) => error.statusCode === 404
    );
  } finally {
    SellerRequest.findByPk = original;
  }
});

test('aprovação de ambiente é exclusiva da equipe TimeOut', async () => {
  await assert.rejects(
    AccessControlService.reviewEnvironmentApplication(1, { status: 'approved' }, { id: 1, role: 'environment_admin' }),
    (error) => error.statusCode === 403
  );
});

test('perfis administrativos têm escopos distintos', () => {
  assert.equal(isEnvironmentAdmin({ role: 'environment_admin' }), true);
  assert.equal(isEnvironmentAdmin({ role: 'platform_admin' }), false);
  assert.equal(isPlatformAdmin({ role: 'platform_admin' }), true);
  assert.equal(isPlatformAdmin({ role: 'customer' }), false);
});

test('CPF fica mascarado por padrão', () => {
  assert.equal(maskCpf('12345678909'), '***.456.789-**');
});

test('códigos de ambiente são aleatórios, difíceis de adivinhar e comparáveis por hash', () => {
  const first = generateEnvironmentAccessCode();
  const second = generateEnvironmentAccessCode();
  assert.match(first, /^TO-[A-F0-9]{16}$/);
  assert.notEqual(first, second);
  assert.equal(hashEnvironmentAccessCode(first), hashEnvironmentAccessCode(first.toLowerCase()));
  assert.notEqual(hashEnvironmentAccessCode(first), hashEnvironmentAccessCode(second));
});
