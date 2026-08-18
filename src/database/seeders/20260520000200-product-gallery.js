'use strict';

const { QueryTypes } = require('sequelize');

const now = () => new Date();

module.exports = {
  async up(queryInterface) {
    const galleryByProduct = {
      Coxinha: ['/uploads/coxinha.svg', '/uploads/suco.svg'],
      'Suco natural': ['/uploads/suco.svg', '/uploads/coxinha.svg'],
    };

    for (const [name, imageGallery] of Object.entries(galleryByProduct)) {
      const products = await queryInterface.sequelize.query(
        'SELECT id FROM products WHERE name = :name LIMIT 1',
        {
          replacements: { name },
          type: QueryTypes.SELECT,
        }
      );

      if (products[0]?.id) {
        await queryInterface.sequelize.query(
          'UPDATE products SET imageGallery = :imageGallery, updatedAt = :updatedAt WHERE id = :id',
          {
            replacements: {
              id: products[0].id,
              imageGallery: JSON.stringify(imageGallery),
              updatedAt: now(),
            },
          }
        );
      }
    }
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'UPDATE products SET imageGallery = NULL WHERE name IN (:names)',
      {
        replacements: { names: ['Coxinha', 'Suco natural'] },
      }
    );
  },
};
