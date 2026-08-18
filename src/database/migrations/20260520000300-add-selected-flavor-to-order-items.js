'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('order_items', 'selectedFlavor', {
      type: Sequelize.STRING(120),
      allowNull: true,
      after: 'productId',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('order_items', 'selectedFlavor');
  },
};
