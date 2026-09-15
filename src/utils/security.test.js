const assert = require('node:assert/strict');
const test = require('node:test');
const {
  generateEmailCode,
  hashSecurityCode,
  isValidBrazilPhone,
  isValidCpf,
  securityCodesMatch,
} = require('./security');

test('gera código de seis dígitos', () => {
  const code = generateEmailCode();
  assert.match(code, /^\d{6}$/);
});

test('gera hash estável sem armazenar o código em texto aberto', () => {
  const hash = hashSecurityCode('123456');
  assert.equal(hash.length, 64);
  assert.equal(hash, hashSecurityCode('123456'));
  assert.notEqual(hash, '123456');
  assert.equal(securityCodesMatch('123456', hash), true);
  assert.equal(securityCodesMatch('654321', hash), false);
  assert.equal(securityCodesMatch('123456', '123456'), true);
});

test('valida CPF pelos dígitos verificadores', () => {
  assert.equal(isValidCpf('529.982.247-25'), true);
  assert.equal(isValidCpf('529.982.247-24'), false);
  assert.equal(isValidCpf('111.111.111-11'), false);
});

test('valida telefone brasileiro com DDD', () => {
  assert.equal(isValidBrazilPhone('(12) 99999-9999'), true);
  assert.equal(isValidBrazilPhone('+55 12 99999-9999'), true);
  assert.equal(isValidBrazilPhone('123'), false);
});
