const dotenv = require('dotenv');
const { spawnSync } = require('node:child_process');
const { Sequelize } = require('sequelize');

function loadEnvironment(envPath, processEnv = process.env) {
  const options = { processEnv, override: true };
  if (envPath) options.path = envPath;

  const result = dotenv.config(options);
  if (result.error) {
    throw new Error('Arquivo .env nao encontrado. Crie o .env do backend com as credenciais do MySQL local antes de executar os testes de integracao.');
  }
  return processEnv;
}

function assertSafeTestDatabaseName(databaseName) {
  if (!databaseName.endsWith('_test')) {
    throw new Error(`Nome de banco de teste inseguro: "${databaseName}". O nome deve terminar em _test.`);
  }
  if (!/^[A-Za-z0-9_]+$/.test(databaseName) || databaseName.length > 64) {
    throw new Error('Nome de banco de teste inseguro. Use somente letras, numeros e sublinhados, com no maximo 64 caracteres.');
  }
  return databaseName;
}

function buildTestDatabaseName(baseName) {
  const normalizedBaseName = String(baseName || '').trim();
  if (!normalizedBaseName || !/^[A-Za-z0-9_]+$/.test(normalizedBaseName)) {
    throw new Error('DB_NAME invalido. Use somente letras, numeros e sublinhados.');
  }
  return assertSafeTestDatabaseName(`${normalizedBaseName}_test`);
}

function buildIntegrationConfig(source = process.env) {
  const baseName = source.DB_NAME || 'local_food_db';
  const port = Number(source.DB_PORT || 3306);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT invalida. Informe uma porta entre 1 e 65535.');
  }

  const databaseName = buildTestDatabaseName(baseName);
  const database = {
    host: source.DB_HOST || 'localhost',
    port,
    baseName,
    name: databaseName,
    user: source.DB_USER || 'root',
    password: source.DB_PASSWORD || '',
  };

  return {
    database,
    env: {
      ...source,
      NODE_ENV: 'test',
      RUN_DB_INTEGRATION_TESTS: 'true',
      PAYMENT_MODE: 'mock',
      DB_HOST: database.host,
      DB_PORT: String(database.port),
      DB_NAME: database.baseName,
      DB_USER: database.user,
      DB_PASSWORD: database.password,
    },
  };
}

function sanitizeText(value, secrets = []) {
  let sanitized = String(value || '');
  for (const secret of secrets.filter(Boolean)) {
    sanitized = sanitized.split(secret).join('[REDACTED]');
    sanitized = sanitized.split(encodeURIComponent(secret)).join('[REDACTED]');
  }
  return sanitized;
}

function writeSanitizedOutput(result, secrets) {
  if (result.stdout) process.stdout.write(sanitizeText(result.stdout, secrets));
  if (result.stderr) process.stderr.write(sanitizeText(result.stderr, secrets));
}

function run(command, args, config) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: config.env,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  const secrets = [config.database.password];
  writeSanitizedOutput(result, secrets);

  if (result.error) throw new Error(sanitizeText(result.error.message, secrets));
  if (result.status !== 0) process.exit(result.status || 1);
}

function createConnection(database, name = '') {
  return new Sequelize(name, database.user, database.password || null, {
    dialect: 'mysql',
    host: database.host,
    port: database.port,
    logging: false,
  });
}

async function createDatabase(config) {
  const databaseName = assertSafeTestDatabaseName(config.database.name);
  const admin = createConnection(config.database);
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    await admin.query(`CREATE DATABASE \`${databaseName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await admin.close();
  }
}

async function insertLegacyFixture(config) {
  const databaseName = assertSafeTestDatabaseName(config.database.name);
  const connection = createConnection(config.database, databaseName);
  try {
    const now = new Date();
    await connection.query(
      'INSERT INTO environments (name, type, accessCode, address, isPrivate, status, accessCodeEnabled, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      { replacements: ['Ambiente legado', 'school', 'LEGACY2026', 'Teste', false, 'active', true, now, now] }
    );
    const [[environment]] = await connection.query('SELECT id FROM environments WHERE accessCode = ?', { replacements: ['LEGACY2026'] });
    await connection.query(
      'INSERT INTO users (name, email, password, role, environmentId, tokenVersion, verificationChannel, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      { replacements: ['Usuário legado', 'legacy.fixture@timeout.test', 'hash-for-migration-only', 'customer', environment.id, 0, 'email', now, now] }
    );
    const [[user]] = await connection.query('SELECT id FROM users WHERE email = ?', { replacements: ['legacy.fixture@timeout.test'] });
    await connection.query(
      'INSERT INTO notifications (userId, title, message, type, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
      { replacements: [user.id, 'Ambiente aprovado', 'Ambiente aprovado. Código inicial: LEGACY2026', 'environment_application', now, now] }
    );
  } finally {
    await connection.close();
  }
}

async function main(config) {
  await createDatabase(config);
  run('npx', ['sequelize-cli', 'db:migrate', '--to', '20260928000400-add-mock-intermediated-payments.js'], config);
  await insertLegacyFixture(config);
  run('npx', ['sequelize-cli', 'db:migrate'], config);
  run('node', ['--test', 'src/services/paymentConcurrency.integration.test.js'], config);
}

if (require.main === module) {
  let config;
  Promise.resolve().then(async () => {
    loadEnvironment();
    config = buildIntegrationConfig(process.env);
    await main(config);
  }).catch((error) => {
    const password = config?.database.password || process.env.DB_PASSWORD;
    console.error(`Falha nos testes de integracao: ${sanitizeText(error.message, [password])}`);
    process.exit(1);
  });
}

module.exports = {
  assertSafeTestDatabaseName,
  buildIntegrationConfig,
  buildTestDatabaseName,
  loadEnvironment,
  sanitizeText,
};
