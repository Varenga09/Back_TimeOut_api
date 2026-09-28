const { spawnSync } = require('node:child_process');
const { Sequelize } = require('sequelize');

const env = {
  ...process.env,
  NODE_ENV: 'test',
  RUN_DB_INTEGRATION_TESTS: 'true',
  PAYMENT_MODE: 'mock',
};

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status || 1);
}

async function createDatabase() {
  const baseName = env.DB_NAME || 'local_food_db';
  const database = `${baseName}_test`;
  const admin = new Sequelize('', env.DB_USER || 'root', env.DB_PASSWORD || null, {
    dialect: 'mysql',
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    logging: false,
  });
  await admin.query(`DROP DATABASE IF EXISTS \`${database.replace(/`/g, '')}\``);
  await admin.query(`CREATE DATABASE \`${database.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await admin.close();
}

async function insertLegacyFixture() {
  const database = `${env.DB_NAME || 'local_food_db'}_test`;
  const connection = new Sequelize(database, env.DB_USER || 'root', env.DB_PASSWORD || null, {
    dialect: 'mysql', host: env.DB_HOST || 'localhost', port: Number(env.DB_PORT || 3306), logging: false,
  });
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
  await connection.close();
}

(async () => {
  await createDatabase();
  run('npx', ['sequelize-cli', 'db:migrate', '--to', '20260928000400-add-mock-intermediated-payments.js']);
  await insertLegacyFixture();
  run('npx', ['sequelize-cli', 'db:migrate']);
  run('node', ['--test', 'src/services/paymentConcurrency.integration.test.js']);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
