'use strict';

const { QueryTypes } = require('sequelize');

const now = () => new Date();

module.exports = {
  async up(queryInterface) {
    const products = await queryInterface.sequelize.query(
      'SELECT id, name FROM products WHERE name IN (:names)',
      {
        replacements: { names: ['Sushi', 'Coxinha', 'Suco natural'] },
        type: QueryTypes.SELECT,
      }
    );

    const productByName = Object.fromEntries(products.map((product) => [product.name, product]));

    const flavorUpdates = [
      ['Sushi', ['Salmão', 'California', 'Skin', 'Hot roll']],
      ['Coxinha', ['Frango com catupiry', 'Frango tradicional']],
      ['Suco natural', ['Laranja', 'Maracuja', 'Abacaxi com hortela']],
    ];

    for (const [name, flavors] of flavorUpdates) {
      if (productByName[name]) {
        await queryInterface.sequelize.query(
          'UPDATE products SET flavors = :flavors, updatedAt = :updatedAt WHERE id = :id',
          {
            replacements: {
              id: productByName[name].id,
              flavors: JSON.stringify(flavors),
              updatedAt: now(),
            },
          }
        );
      }
    }

    const users = await queryInterface.sequelize.query(
      'SELECT id, email FROM users WHERE email IN (:emails)',
      {
        replacements: { emails: ['mateus@localfood.com', 'admin@localfood.com'] },
        type: QueryTypes.SELECT,
      }
    );

    const userByEmail = Object.fromEntries(users.map((user) => [user.email, user]));
    const reviewSeeds = [
      {
        productName: 'Coxinha',
        email: 'mateus@localfood.com',
        rating: 5,
        comment: 'Chegou quentinha e bem recheada. Compraria de novo.',
      },
      {
        productName: 'Suco natural',
        email: 'mateus@localfood.com',
        rating: 4,
        comment: 'Bem gelado e combinou com o intervalo.',
      },
      {
        productName: 'Sushi',
        email: 'admin@localfood.com',
        rating: 5,
        comment: 'Boa apresentação e variedade de peças.',
      },
    ];

    const reviewsToCreate = [];

    for (const seed of reviewSeeds) {
      const product = productByName[seed.productName];
      const user = userByEmail[seed.email];
      if (!product || !user) continue;

      const existing = await queryInterface.sequelize.query(
        'SELECT id FROM product_reviews WHERE productId = :productId AND userId = :userId LIMIT 1',
        {
          replacements: {
            productId: product.id,
            userId: user.id,
          },
          type: QueryTypes.SELECT,
        }
      );

      if (!existing[0]) {
        reviewsToCreate.push({
          productId: product.id,
          userId: user.id,
          rating: seed.rating,
          comment: seed.comment,
          createdAt: now(),
          updatedAt: now(),
        });
      }
    }

    if (reviewsToCreate.length > 0) {
      await queryInterface.bulkInsert('product_reviews', reviewsToCreate);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('product_reviews', {
      comment: [
        'Chegou quentinha e bem recheada. Compraria de novo.',
        'Bem gelado e combinou com o intervalo.',
        'Boa apresentação e variedade de peças.',
      ],
    });
  },
};
