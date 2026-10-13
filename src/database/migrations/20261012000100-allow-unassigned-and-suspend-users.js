'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const migrate = async (transaction) => {
      const users = await queryInterface.describeTable('users', { transaction });
      if (!users.environmentId.allowNull) {
        if (queryInterface.sequelize.getDialect() === 'postgres') {
          await queryInterface.sequelize.query('ALTER TABLE "users" ALTER COLUMN "environmentId" DROP NOT NULL', { transaction });
        } else {
          await queryInterface.changeColumn('users', 'environmentId', { type: Sequelize.INTEGER, allowNull: true }, { transaction });
        }
      }
      if (!users.isSuspended) {
        await queryInterface.addColumn('users', 'isSuspended', {
          type: Sequelize.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        }, { transaction });
      }
      const sellerRequests = await queryInterface.describeTable('seller_requests', { transaction });
      if (!sellerRequests.documentPath) {
        await queryInterface.addColumn('seller_requests', 'documentPath', { type: Sequelize.STRING(500), allowNull: true }, { transaction });
      }
    };
    if (queryInterface.sequelize.getDialect() === 'postgres') {
      await queryInterface.sequelize.transaction(migrate);
    } else {
      await migrate(undefined);
    }
  },
  async down() {
    // No destructive rollback: accounts without an environment must remain valid.
  },
};
