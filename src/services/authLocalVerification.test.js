const assert = require('node:assert/strict');
const test = require('node:test');
const AuthService = require('./AuthService');
const UserRepository = require('../repositories/UserRepository');
const { securityCodesMatch } = require('../utils/security');

test('conta antiga pode confirmar e-mail no modo local sem servico externo', async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    identityMode: process.env.IDENTITY_VERIFICATION_MODE,
    localCode: process.env.LOCAL_VERIFICATION_CODE,
    findRawById: UserRepository.findRawById,
    findById: UserRepository.findById,
    sendVerificationCode: AuthService.sendVerificationCode,
  };
  const user = {
    id: 23,
    email: 'mateus@timeout.test',
    name: 'Mateus',
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    async update(values) { Object.assign(this, values); },
  };

  try {
    process.env.NODE_ENV = 'development';
    process.env.IDENTITY_VERIFICATION_MODE = 'mock';
    delete process.env.LOCAL_VERIFICATION_CODE;
    UserRepository.findRawById = async () => user;
    UserRepository.findById = async () => ({ id: user.id, emailVerifiedAt: user.emailVerifiedAt });
    AuthService.sendVerificationCode = async () => { throw new Error('Envio externo indevido'); };

    const result = await AuthService.resendVerification(user.id, 'email');
    assert.equal(result.verificationReason, 'LOCAL_DELIVERY');
    assert.equal(result.developmentCode, '123456');
    assert.notEqual(user.emailVerificationCode, '123456');
    assert.equal(securityCodesMatch('123456', user.emailVerificationCode), true);

    const confirmed = await AuthService.verifyEmail(user.id, result.developmentCode);
    assert.ok(confirmed.emailVerifiedAt);
  } finally {
    for (const [name, value] of [
      ['NODE_ENV', previous.nodeEnv],
      ['IDENTITY_VERIFICATION_MODE', previous.identityMode],
      ['LOCAL_VERIFICATION_CODE', previous.localCode],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    UserRepository.findRawById = previous.findRawById;
    UserRepository.findById = previous.findById;
    AuthService.sendVerificationCode = previous.sendVerificationCode;
  }
});

test('fora do desenvolvimento o codigo de confirmacao nao aparece na resposta', async () => {
  const previous = {
    nodeEnv: process.env.NODE_ENV,
    identityMode: process.env.IDENTITY_VERIFICATION_MODE,
    findRawById: UserRepository.findRawById,
    sendVerificationCode: AuthService.sendVerificationCode,
  };
  const user = {
    id: 23,
    email: 'mateus@timeout.test',
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    async update(values) { Object.assign(this, values); },
  };
  let sent = false;

  try {
    process.env.NODE_ENV = 'production';
    process.env.IDENTITY_VERIFICATION_MODE = 'mock';
    UserRepository.findRawById = async () => user;
    AuthService.sendVerificationCode = async () => { sent = true; return { sent: true }; };

    const result = await AuthService.resendVerification(user.id, 'email');
    assert.equal(sent, true);
    assert.equal(result.developmentCode, undefined);
    assert.notEqual(user.emailVerificationCode, '123456');
  } finally {
    if (previous.nodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous.nodeEnv;
    if (previous.identityMode === undefined) delete process.env.IDENTITY_VERIFICATION_MODE;
    else process.env.IDENTITY_VERIFICATION_MODE = previous.identityMode;
    UserRepository.findRawById = previous.findRawById;
    AuthService.sendVerificationCode = previous.sendVerificationCode;
  }
});
