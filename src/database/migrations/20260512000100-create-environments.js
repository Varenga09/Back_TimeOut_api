'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('environments', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      name: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      type: {
        type: Sequelize.ENUM('school', 'company', 'factory', 'college', 'office', 'other'),
        allowNull: false,
        defaultValue: 'other',
      },
      accessCode: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      address: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('environments');
  },
};
