'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'imageGallery', {
      type: Sequelize.JSON,
      allowNull: true,
      after: 'imageUrl',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('products', 'imageGallery');
  },
};
