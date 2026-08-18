'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'profileImageUrl', {
      type: Sequelize.STRING(255),
      allowNull: true,
      after: 'phone',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'profileImageUrl');
  },
};
