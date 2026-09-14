'use strict';

const bcrypt = require('bcrypt');
const { QueryTypes } = require('sequelize');

const now = () => new Date();

module.exports = {
  async up(queryInterface) {
    const q = (identifier) => queryInterface.quoteIdentifier(identifier);
    const existingCategories = await queryInterface.sequelize.query(
      'SELECT COUNT(*) AS total FROM categories',
      { type: QueryTypes.SELECT }
    );

    if (Number(existingCategories[0].total) === 0) {
      await queryInterface.bulkInsert(
        'categories',
        ['Salgados', 'Doces', 'Bebidas', 'Marmitas', 'Lanches', 'Sobremesas', 'Outros'].map((name) => ({
          name,
          createdAt: now(),
          updatedAt: now(),
        }))
      );
    }

    const existingEnvironment = await queryInterface.sequelize.query(
      `SELECT id FROM environments WHERE ${q('accessCode')} = :accessCode LIMIT 1`,
      {
        replacements: { accessCode: 'SENAI2026' },
        type: QueryTypes.SELECT,
      }
    );

    let environmentId = existingEnvironment[0]?.id;

    if (!environmentId) {
      await queryInterface.bulkInsert('environments', [
        {
          name: 'SENAI Taubate',
          type: 'school',
          accessCode: 'SENAI2026',
          address: 'Taubate - SP',
          createdAt: now(),
          updatedAt: now(),
        },
      ]);

      const createdEnvironment = await queryInterface.sequelize.query(
        `SELECT id FROM environments WHERE ${q('accessCode')} = :accessCode LIMIT 1`,
        {
          replacements: { accessCode: 'SENAI2026' },
          type: QueryTypes.SELECT,
        }
      );

      environmentId = createdEnvironment[0].id;
    }

    const salt = await bcrypt.genSalt(10);
    const users = [
      {
        name: 'Admin SENAI',
        email: 'admin@localfood.com',
        password: await bcrypt.hash('123456', salt),
        phone: '12999990000',
        profileImageUrl: '/uploads/avatar-admin.svg',
        role: 'admin',
        environmentId,
      },
      {
        name: 'Vendedor Local',
        email: 'vendedor@localfood.com',
        password: await bcrypt.hash('123456', salt),
        phone: '12999991111',
        profileImageUrl: '/uploads/avatar-vendedor.svg',
        role: 'seller',
        environmentId,
      },
      {
        name: 'Mateus Cliente',
        email: 'mateus@localfood.com',
        password: await bcrypt.hash('123456', salt),
        phone: '12999992222',
        profileImageUrl: '/uploads/avatar-mateus.svg',
        role: 'customer',
        environmentId,
      },
    ];

    const existingUsers = await queryInterface.sequelize.query(
      'SELECT email FROM users WHERE email IN (:emails)',
      {
        replacements: { emails: users.map((user) => user.email) },
        type: QueryTypes.SELECT,
      }
    );

    const existingEmails = new Set(existingUsers.map((user) => user.email));
    const usersToCreate = users
      .filter((user) => !existingEmails.has(user.email))
      .map((user) => ({
        ...user,
        createdAt: now(),
        updatedAt: now(),
      }));

    if (usersToCreate.length > 0) {
      await queryInterface.bulkInsert('users', usersToCreate);
    }

    const sellerRows = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email LIMIT 1',
      {
        replacements: { email: 'vendedor@localfood.com' },
        type: QueryTypes.SELECT,
      }
    );

    const coxinhaRows = await queryInterface.sequelize.query(
      `SELECT id FROM products WHERE name = :name AND ${q('environmentId')} = :environmentId LIMIT 1`,
      {
        replacements: { name: 'Coxinha', environmentId },
        type: QueryTypes.SELECT,
      }
    );

    if (sellerRows[0]?.id && !coxinhaRows[0]) {
      const categoryRows = await queryInterface.sequelize.query(
        'SELECT id, name FROM categories WHERE name IN (:names)',
        {
          replacements: { names: ['Salgados', 'Bebidas'] },
          type: QueryTypes.SELECT,
        }
      );

      const categoryByName = Object.fromEntries(categoryRows.map((category) => [category.name, category.id]));

      await queryInterface.bulkInsert('products', [
        {
          name: 'Coxinha',
          description: 'Coxinha de frango com catupiry',
          price: 6.5,
          imageUrl: '/uploads/coxinha.svg',
          quantity: 20,
          isActive: true,
          userId: sellerRows[0].id,
          categoryId: categoryByName.Salgados,
          environmentId,
          createdAt: now(),
          updatedAt: now(),
        },
        {
          name: 'Suco natural',
          description: 'Suco gelado de fruta da estação',
          price: 5.0,
          imageUrl: '/uploads/suco.svg',
          quantity: 15,
          isActive: true,
          userId: sellerRows[0].id,
          categoryId: categoryByName.Bebidas,
          environmentId,
          createdAt: now(),
          updatedAt: now(),
        },
      ]);
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('products', { name: ['Coxinha', 'Suco natural'] });
    await queryInterface.bulkDelete('users', {
      email: ['admin@localfood.com', 'vendedor@localfood.com', 'mateus@localfood.com'],
    });
    await queryInterface.bulkDelete('environments', { accessCode: 'SENAI2026' });
    await queryInterface.bulkDelete('categories', {
      name: ['Salgados', 'Doces', 'Bebidas', 'Marmitas', 'Lanches', 'Sobremesas', 'Outros'],
    });
  },
};
