const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { User, UserEnvironment } = require('../models');
const service = require('./AccountAdministrationService');

test('equipe consulta participações de todos os ambientes e filtra vendedor pela participação', async () => {
  const originalUsers = User.findAndCountAll;
  const originalMemberships = UserEnvironment.findAll;
  let query;
  UserEnvironment.findAll = async () => [{ userId: 7 }];
  User.findAndCountAll = async (options) => {
    query = options;
    return { rows: [{ id: 7, role: 'customer', memberships: [{ environmentId: 2, role: 'seller' }] }], count: 1 };
  };
  try {
    const result = await service.list({ id: 1, role: 'platform_admin' }, { role: 'seller' });
    assert.equal(result.total, 1);
    assert.equal(result.users[0].memberships[0].role, 'seller');
    assert.equal(query.include[0].where, undefined);
    assert.deepEqual(query.where[Op.and][0][Op.or][1].id[Op.in], [7]);
  } finally {
    User.findAndCountAll = originalUsers;
    UserEnvironment.findAll = originalMemberships;
  }
});
