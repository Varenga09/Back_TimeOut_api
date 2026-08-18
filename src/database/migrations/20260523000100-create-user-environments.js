'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
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

    await queryInterface.addIndex('user_environments', ['userId', 'environmentId'], {
      unique: true,
      name: 'user_environments_user_environment_unique',
    });

    await queryInterface.sequelize.query(`
      INSERT INTO user_environments (userId, environmentId, role, createdAt, updatedAt)
      SELECT id, environmentId, role, NOW(), NOW()
      FROM users
      WHERE environmentId IS NOT NULL
    `);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_environments');
  },
};
