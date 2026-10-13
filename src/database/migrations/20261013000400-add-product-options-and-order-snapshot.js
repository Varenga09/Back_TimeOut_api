'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'sizeOptions', { type: Sequelize.JSON, allowNull: true });
    await queryInterface.addColumn('products', 'addons', { type: Sequelize.JSON, allowNull: true });
    await queryInterface.addColumn('order_items', 'optionsSnapshot', { type: Sequelize.JSON, allowNull: true });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('order_items', 'optionsSnapshot');
    await queryInterface.removeColumn('products', 'addons');
    await queryInterface.removeColumn('products', 'sizeOptions');
  },
};
