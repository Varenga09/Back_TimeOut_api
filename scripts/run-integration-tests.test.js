const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  assertSafeTestDatabaseName,
  buildIntegrationConfig,
  buildTestDatabaseName,
  loadEnvironment,
  sanitizeText,
} = require('./run-integration-tests');

test('carrega as credenciais do arquivo .env e monta a configuracao de integracao', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'timeout-env-'));
  const envPath = path.join(directory, '.env');
  fs.writeFileSync(envPath, [
    'DB_HOST=127.0.0.2',
    'DB_PORT=3307',
    'DB_NAME=timeout_local',
    'DB_USER=timeout_user',
    'DB_PASSWORD=senha-super-secreta',
  ].join('\n'));

  try {
    const loaded = loadEnvironment(envPath, {});
    const config = buildIntegrationConfig(loaded);
    assert.deepEqual(config.database, {
      host: '127.0.0.2',
      port: 3307,
      baseName: 'timeout_local',
      name: 'timeout_local_test',
      user: 'timeout_user',
      password: 'senha-super-secreta',
    });
    assert.equal(config.env.DB_NAME, 'timeout_local');
    assert.equal(config.env.NODE_ENV, 'test');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('interrompe com mensagem clara quando o arquivo .env nao existe', () => {
  const missingPath = path.join(os.tmpdir(), `timeout-env-ausente-${Date.now()}`, '.env');
  assert.throws(() => loadEnvironment(missingPath, {}), /Arquivo \.env nao encontrado/);
});

test('acrescenta _test ao nome configurado', () => {
  assert.equal(buildTestDatabaseName('local_food_db'), 'local_food_db_test');
  assert.equal(buildTestDatabaseName('timeout_test'), 'timeout_test_test');
});

test('bloqueia nomes de banco inseguros antes de qualquer operacao destrutiva', () => {
  assert.throws(() => assertSafeTestDatabaseName('local_food_db'), /terminar em _test/);
  assert.throws(() => buildTestDatabaseName('local-food-db'), /DB_NAME invalido/);
  assert.throws(() => buildTestDatabaseName('local_food;DROP DATABASE'), /DB_NAME invalido/);
  assert.throws(() => buildTestDatabaseName(''), /DB_NAME invalido/);
});

test('remove a senha de logs e mensagens de erro', () => {
  const password = 's@nh/a muito secreta';
  const output = sanitizeText(`Falha usando ${password} ou ${encodeURIComponent(password)}`, [password]);
  assert.equal(output.includes(password), false);
  assert.equal(output.includes(encodeURIComponent(password)), false);
  assert.match(output, /\[REDACTED\]/);
});
