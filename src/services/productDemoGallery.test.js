const test = require('node:test');
const assert = require('node:assert/strict');
const migration = require('../database/migrations/20261013000200-remove-cross-product-demo-images');

test('removes only foreign demo images and preserves other gallery photos', async () => {
  const updates = [];
  const products = [
    { id: 1, name: 'Suco natural', imageUrl: '/uploads/suco.svg', imageGallery: JSON.stringify(['/uploads/suco.svg', '/uploads/coxinha.svg', '/uploads/foto-extra.jpg']) },
    { id: 2, name: 'Coxinha', imageUrl: '/uploads/coxinha.svg', imageGallery: ['/uploads/coxinha.svg', '/uploads/suco.svg'] },
    { id: 3, name: 'Suco natural', imageUrl: '/uploads/foto-propria.jpg', imageGallery: JSON.stringify(['/uploads/coxinha.svg']) },
  ];
  const queryInterface = {
    quoteIdentifier: (value) => `\`${value}\``,
    sequelize: {
      transaction: (callback) => callback({}),
      query: async (sql, options) => {
        if (sql.startsWith('SELECT')) return products;
        updates.push(options.replacements);
      },
    },
  };

  await migration.up(queryInterface);

  assert.equal(updates.length, 2);
  assert.deepEqual(JSON.parse(updates[0].gallery), ['/uploads/suco.svg', '/uploads/foto-extra.jpg']);
  assert.deepEqual(JSON.parse(updates[1].gallery), ['/uploads/coxinha.svg']);
  assert.deepEqual(updates.map((update) => update.id), [1, 2]);
});
