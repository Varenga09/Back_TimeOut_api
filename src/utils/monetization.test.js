const assert = require('node:assert/strict');
const test = require('node:test');
const { calculateCommission } = require('./platformFee');
const PaymentService = require('../services/PaymentService');

test('calcula comissão de 7% do plano Básico', () => {
  assert.deepEqual(calculateCommission(100, 7), {
    rate: 7,
    amount: 7,
    sellerNetAmount: 93,
  });
});

test('calcula comissão de 3% do plano Pro com arredondamento monetário', () => {
  assert.deepEqual(calculateCommission(19.99, 3), {
    rate: 3,
    amount: 0.6,
    sellerNetAmount: 19.39,
  });
});

test('pagamentos usam modo mock por padrão e não acionam gateway real', () => {
  const previous = process.env.PAYMENT_MODE;
  delete process.env.PAYMENT_MODE;
  assert.equal(PaymentService.getMode(), 'mock');
  assert.equal(PaymentService.requiresPayment('cash'), true);
  assert.equal(PaymentService.requiresConfirmedPayment({ paymentProvider: 'mock', paymentMethod: 'pix' }), true);
  if (previous === undefined) delete process.env.PAYMENT_MODE;
  else process.env.PAYMENT_MODE = previous;
});
