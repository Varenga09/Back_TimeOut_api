const test = require('node:test');
const assert = require('node:assert/strict');
const { Notification } = require('../models');
const service = require('./InternalNotificationService');
const migration = require('../database/migrations/20261013000100-add-notification-targets');

test('notificações novas gravam destino estruturado sem perder o link antigo', async () => {
  const original = Notification.create;
  let payload;
  Notification.create = async (values) => { payload = values; return values; };
  try {
    await service.create(7, 'Nova solicitação', 'Aguardando análise', 'environment_application_review', '/platform', null, {
      resourceType: 'environment_application', resourceId: 35, environmentId: 4,
    });
    assert.equal(payload.targetView, 'platform-access');
    assert.equal(payload.resourceType, 'environment_application');
    assert.equal(payload.resourceId, '35');
    assert.equal(payload.environmentId, 4);
    assert.equal(payload.internalLink, '/platform');
  } finally {
    Notification.create = original;
  }
});

test('migration adiciona metadados sem recriar notificações antigas', async () => {
  const added = [];
  const columns = { id: {}, userId: {}, internalLink: {} };
  const queryInterface = {
    describeTable: async () => columns,
    addColumn: async (table, name) => { added.push([table, name]); columns[name] = {}; },
  };
  const Sequelize = { STRING: () => 'string', INTEGER: 'integer' };
  await migration.up(queryInterface, Sequelize);
  await migration.up(queryInterface, Sequelize);
  assert.deepEqual(added.map((item) => item[1]), ['targetView', 'resourceType', 'resourceId', 'environmentId']);
  assert.ok(added.every((item) => item[0] === 'notifications'));
});

test('rollback não descarta destinos já gravados', async () => {
  const queryInterface = {
    describeTable: async () => ({ targetView: {} }),
    quoteIdentifier: (name) => `"${name}"`,
    sequelize: { query: async () => [[{ count: '1' }]] },
    removeColumn: async () => { throw new Error('Não deveria remover'); },
  };
  await assert.rejects(migration.down(queryInterface), /destinos de notificação/);
});
