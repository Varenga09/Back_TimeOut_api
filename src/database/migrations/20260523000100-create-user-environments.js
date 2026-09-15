'use strict';

const { QueryTypes } = require('sequelize');

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableNames = tables.map((table) =>
      typeof table === 'string' ? table : table.tableName || table.name
    );

    if (!tableNames.includes('user_environments')) {
      await queryInterface.createTable('user_environments', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false,
        },
        userId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        environmentId: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'environments',
            key: 'id',
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        role: {
          type: Sequelize.ENUM('customer', 'seller', 'admin'),
          allowNull: false,
          defaultValue: 'customer',
        },
        createdAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },
        updatedAt: {
          type: Sequelize.DATE,
          allowNull: false,
        },
      });
    }

    const indexes = await queryInterface.showIndex('user_environments');
    if (!indexes.some((index) => index.name === 'user_environments_user_environment_unique')) {
      await queryInterface.addIndex('user_environments', ['userId', 'environmentId'], {
        unique: true,
        name: 'user_environments_user_environment_unique',
      });
    }

    const q = (identifier) => queryInterface.quoteIdentifier(identifier);
    const users = await queryInterface.sequelize.query(
      `SELECT id, ${q('environmentId')} AS ${q('environmentId')}, role
       FROM users
       WHERE ${q('environmentId')} IS NOT NULL`,
      { type: QueryTypes.SELECT }
    );

    if (users.length > 0) {
      const now = new Date();
      await queryInterface.bulkInsert(
        'user_environments',
        users.map((user) => ({
          userId: user.id,
          environmentId: user.environmentId,
          role: user.role,
          createdAt: now,
          updatedAt: now,
        })),
        { ignoreDuplicates: true }
      );
    }
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_environments');
  },
};
