'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'passwordResetCodeHash', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'passwordResetExpiresAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'tokenVersion', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'tokenVersion');
    await queryInterface.removeColumn('users', 'passwordResetExpiresAt');
    await queryInterface.removeColumn('users', 'passwordResetCodeHash');
  },
};
