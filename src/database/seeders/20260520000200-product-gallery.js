'use strict';

const { QueryTypes } = require('sequelize');

const now = () => new Date();

module.exports = {
  async up(queryInterface) {
    const q = (identifier) => queryInterface.quoteIdentifier(identifier);
    const galleryByProduct = {
      Coxinha: '/uploads/coxinha.svg',
      'Suco natural': '/uploads/suco.svg',
    };

    for (const [name, imageUrl] of Object.entries(galleryByProduct)) {
      const products = await queryInterface.sequelize.query(
        `SELECT id FROM products WHERE name = :name AND ${q('imageUrl')} = :imageUrl AND ${q('imageGallery')} IS NULL LIMIT 1`,
        {
          replacements: { name, imageUrl },
          type: QueryTypes.SELECT,
        }
      );

      if (products[0]?.id) {
        await queryInterface.sequelize.query(
          `UPDATE products SET ${q('imageGallery')} = :imageGallery, ${q('updatedAt')} = :updatedAt WHERE id = :id`,
          {
            replacements: {
              id: products[0].id,
              imageGallery: JSON.stringify([]),
              updatedAt: now(),
            },
          }
        );
      }
    }
  },

  async down() {},
};
