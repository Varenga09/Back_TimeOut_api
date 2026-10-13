'use strict';

const { QueryTypes } = require('sequelize');

const demoProducts = {
  Coxinha: { mainImage: '/uploads/coxinha.svg', foreignImage: '/uploads/suco.svg' },
  'Suco natural': { mainImage: '/uploads/suco.svg', foreignImage: '/uploads/coxinha.svg' },
};

function parseGallery(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

module.exports = {
  async up(queryInterface) {
    const q = (identifier) => queryInterface.quoteIdentifier(identifier);
    await queryInterface.sequelize.transaction(async (transaction) => {
      const products = await queryInterface.sequelize.query(
        `SELECT id, name, ${q('imageUrl')}, ${q('imageGallery')} FROM products WHERE name IN (:names)`,
        {
          replacements: { names: Object.keys(demoProducts) },
          type: QueryTypes.SELECT,
          transaction,
        }
      );

      for (const product of products) {
        const demo = demoProducts[product.name];
        if (product.imageUrl !== demo?.mainImage) continue;

        const gallery = parseGallery(product.imageGallery);
        if (!gallery?.includes(demo.foreignImage)) continue;

        await queryInterface.sequelize.query(
          `UPDATE products SET ${q('imageGallery')} = :gallery, ${q('updatedAt')} = :updatedAt WHERE id = :id`,
          {
            replacements: {
              id: product.id,
              gallery: JSON.stringify(gallery.filter((image) => image !== demo.foreignImage)),
              updatedAt: new Date(),
            },
            transaction,
          }
        );
      }
    });
  },

  async down() {
    // A data repair must not restore images from another product.
  },
};
