'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('users', 'emailVerificationCode', {
      type: Sequelize.STRING(64),
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('users', 'emailVerificationCode', {
      type: Sequelize.STRING(10),
      allowNull: true,
    });
  },
};
