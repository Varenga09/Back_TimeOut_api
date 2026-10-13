const assert = require('node:assert/strict');
const test = require('node:test');
const { run } = require('./platform-admin-startup');

const request = 'TIMEOUT_PRODUCTION:PERSON@TIMEOUT.TEST';

test('sem solicitação explícita, a inicialização não consulta nem promove contas', async () => {
  const result = await run({
    env: { NODE_ENV: 'production' },
    service: { inspectAccount: () => { throw new Error('Não deveria consultar o banco'); } },
  });
  assert.deepEqual(result, { skipped: true });
});

test('conta não confirmada nunca é promovida durante a inicialização', async () => {
  let grants = 0;
  const env = {
    NODE_ENV: 'production',
    PLATFORM_ADMIN_BOOTSTRAP_REQUEST: request,
    PLATFORM_ADMIN_BOOTSTRAP_SECRET: 'secret-value',
    PLATFORM_ADMIN_BOOTSTRAP_INPUT: 'secret-value',
  };
  const logs = [];
  const result = await run({
    env,
    logger: { log: (message) => logs.push(message), warn: (message) => logs.push(message) },
    service: {
      inspectAccount: async () => ({ email: 'person@timeout.test', role: 'customer', emailVerified: false }),
      grant: async () => { grants += 1; },
    },
  });

  assert.equal(result.skipped, true);
  assert.equal(grants, 0);
  assert.equal(env.PLATFORM_ADMIN_BOOTSTRAP_INPUT, undefined);
  assert.doesNotMatch(logs.join('\n'), /secret-value/);
});

test('conta confirmada é consultada antes de uma única tentativa de promoção', async () => {
  const sequence = [];
  const result = await run({
    env: {
      NODE_ENV: 'production',
      PLATFORM_ADMIN_BOOTSTRAP_REQUEST: request,
      PLATFORM_ADMIN_BOOTSTRAP_SECRET: 'a'.repeat(40),
      PLATFORM_ADMIN_BOOTSTRAP_INPUT: 'a'.repeat(40),
    },
    logger: { log: () => {}, warn: () => {} },
    service: {
      inspectAccount: async (options) => {
        sequence.push('status');
        assert.equal(options.email, 'PERSON@TIMEOUT.TEST');
        assert.equal(options.confirmation, 'TIMEOUT_PRODUCTION');
        return { email: 'person@timeout.test', role: 'customer', emailVerified: true };
      },
      grant: async () => {
        sequence.push('grant');
        return { email: 'person@timeout.test', role: 'platform_admin', emailVerified: true, changed: true, sessionsInvalidated: true };
      },
    },
  });
  assert.deepEqual(sequence, ['status', 'grant']);
  assert.equal(result.role, 'platform_admin');
});
