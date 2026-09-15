const assert = require('node:assert/strict');
const test = require('node:test');
const {
  registerSchema,
  resetPasswordSchema,
} = require('./authValidation');

const registration = {
  name: 'Pessoa Teste',
  email: 'pessoa@example.com',
  environmentAccessCode: 'TESTE2026',
};

test('recusa senha fraca no cadastro', () => {
  const result = registerSchema.validate({ ...registration, password: '123456' });
  assert.ok(result.error);
});

test('aceita senha forte no cadastro', () => {
  const result = registerSchema.validate({ ...registration, password: 'Senha123!' });
  assert.equal(result.error, undefined);
});

test('recuperação exige código de seis dígitos e senha forte', () => {
  assert.ok(resetPasswordSchema.validate({
    email: registration.email,
    code: '12345',
    password: 'Senha123!',
  }).error);

  assert.equal(resetPasswordSchema.validate({
    email: registration.email,
    code: '123456',
    password: 'Senha123!',
  }).error, undefined);
});
