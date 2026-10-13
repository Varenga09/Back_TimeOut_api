const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { sequelize, User } = require('../models');
const AuditService = require('./AuditService');
const PlatformAdminService = require('./PlatformAdminService');
const { formatResult } = require('../../scripts/platform-admin-command');

const authorization = {
  nodeEnv: 'production',
  confirmation: 'TIMEOUT_PRODUCTION',
  configuredSecret: 'a'.repeat(40),
  providedSecret: 'a'.repeat(40),
};

function makeUser(overrides = {}) {
  return {
    id: 7,
    email: 'person@timeout.test',
    role: 'customer',
    environmentId: 12,
    emailVerifiedAt: new Date(),
    tokenVersion: 3,
    async update(values) { Object.assign(this, values); },
    ...overrides,
  };
}

async function withStubs(callback) {
  const originals = {
    transaction: sequelize.transaction,
    findOne: User.findOne,
    findByPk: User.findByPk,
    count: User.count,
    audit: AuditService.record,
  };
  const transaction = { LOCK: { UPDATE: 'UPDATE' } };
  sequelize.transaction = async (work) => work(transaction);
  AuditService.record = async () => null;
  try {
    await callback(transaction);
  } finally {
    sequelize.transaction = originals.transaction;
    User.findOne = originals.findOne;
    User.findByPk = originals.findByPk;
    User.count = originals.count;
    AuditService.record = originals.audit;
  }
}

test('promove usuário confirmado, normaliza e-mail e invalida sessões anteriores', async () => {
  await withStubs(async () => {
    const user = makeUser();
    let searchedEmail;
    let auditCount = 0;
    User.findOne = async ({ where }) => { searchedEmail = where.email; return user; };
    AuditService.record = async (entry) => {
      auditCount += 1;
      assert.equal(entry.action, 'platform_admin.granted_by_bootstrap');
      assert.equal(entry.actorId, null);
    };

    const result = await PlatformAdminService.grant({ email: ' PERSON@TIMEOUT.TEST ', ...authorization });

    assert.equal(searchedEmail, 'person@timeout.test');
    assert.equal(user.role, 'platform_admin');
    assert.equal(user.environmentId, 12);
    assert.equal(user.tokenVersion, 4);
    assert.equal(result.sessionsInvalidated, true);
    assert.equal(auditCount, 1);
  });
});

test('recusa usuário inexistente', async () => {
  await withStubs(async () => {
    User.findOne = async () => null;
    await assert.rejects(
      PlatformAdminService.grant({ email: 'missing@timeout.test', ...authorization }),
      /Usuário não encontrado/
    );
  });
});

test('recusa usuário sem e-mail confirmado', async () => {
  await withStubs(async () => {
    User.findOne = async () => makeUser({ emailVerifiedAt: null });
    await assert.rejects(
      PlatformAdminService.grant({ email: 'person@timeout.test', ...authorization }),
      /ainda não foi confirmado/
    );
  });
});

test('execução repetida é idempotente e não duplica auditoria', async () => {
  await withStubs(async () => {
    const user = makeUser({ role: 'platform_admin' });
    let auditCount = 0;
    User.findOne = async () => user;
    AuditService.record = async () => { auditCount += 1; };

    const result = await PlatformAdminService.grant({ email: user.email, ...authorization });

    assert.equal(result.changed, false);
    assert.equal(result.sessionsInvalidated, false);
    assert.equal(user.tokenVersion, 3);
    assert.equal(auditCount, 0);
  });
});

test('bloqueia execução sem segredo válido e impede autopromoção', async () => {
  await assert.rejects(
    PlatformAdminService.grant({
      email: 'person@timeout.test',
      ...authorization,
      providedSecret: 'segredo-incorreto',
    }),
    /Autorização administrativa inválida/
  );

  await withStubs(async () => {
    User.findOne = async () => makeUser();
    await assert.rejects(
      PlatformAdminService.grant({ email: 'person@timeout.test', actorUserId: 7, ...authorization }),
      /Autopromoção não é permitida/
    );
  });
});

test('protege o último administrador interno', async () => {
  await withStubs(async () => {
    User.findByPk = async () => makeUser({ role: 'platform_admin' });
    User.count = async () => 1;
    await assert.rejects(
      PlatformAdminService.assertCanRemove(7),
      /último administrador interno/
    );
  });
});

test('administrador interno mantém ambiente legado, mas não pode trocá-lo', async () => {
  const user = User.build({ role: 'platform_admin', environmentId: 12 }, { isNewRecord: false, raw: true });
  user._previousDataValues = { ...user.dataValues };

  user.set('name', 'Equipe Time Out');
  await User.runHooks('beforeUpdate', user);

  user.set('environmentId', 13);
  await assert.rejects(User.runHooks('beforeUpdate', user), /acesso interno/);
});

test('não existe rota pública de promoção e a saída nunca contém segredo ou senha', () => {
  const routesRoot = path.resolve(__dirname, '../routes');
  const routes = fs.readdirSync(routesRoot)
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(routesRoot, name), 'utf8'))
    .join('\n');
  assert.doesNotMatch(routes, /platform-admin:grant|platform_admin\.granted|bootstrap/i);

  const output = formatResult('grant', {
    email: 'person@timeout.test',
    role: 'platform_admin',
    emailVerified: true,
    changed: true,
    sessionsInvalidated: true,
    password: 'never-print-this',
    secret: 'never-print-this-either',
  });
  assert.doesNotMatch(output, /never-print/);
  assert.doesNotMatch(output, /password|secret/i);
});
