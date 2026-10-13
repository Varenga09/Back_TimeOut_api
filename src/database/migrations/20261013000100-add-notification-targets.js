'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('notifications');
    const targets = {
      targetView: Sequelize.STRING(80),
      resourceType: Sequelize.STRING(80),
      resourceId: Sequelize.STRING(80),
      environmentId: Sequelize.INTEGER,
    };
    for (const [name, type] of Object.entries(targets)) {
      if (!columns[name]) await queryInterface.addColumn('notifications', name, { type, allowNull: true });
    }
  },
  async down(queryInterface) {
    const columns = await queryInterface.describeTable('notifications');
    const names = ['targetView', 'resourceType', 'resourceId', 'environmentId'].filter((name) => columns[name]);
    if (names.length) {
      const table = queryInterface.quoteIdentifier('notifications');
      const conditions = names.map((name) => `${queryInterface.quoteIdentifier(name)} IS NOT NULL`).join(' OR ');
      const [rows] = await queryInterface.sequelize.query(`SELECT COUNT(*) AS count FROM ${table} WHERE ${conditions}`);
      if (Number(rows[0].count) > 0) throw new Error('Rollback interrompido: há destinos de notificação que seriam perdidos');
    }
    for (const name of names) {
      if (columns[name]) await queryInterface.removeColumn('notifications', name);
    }
  },
};
