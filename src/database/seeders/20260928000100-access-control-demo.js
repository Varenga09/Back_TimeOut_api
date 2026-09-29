'use strict';

const bcrypt = require('bcrypt');
const { QueryTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    if (process.env.NODE_ENV === 'production') return;

    const q = (name) => queryInterface.quoteIdentifier(name);
    const [environment] = await queryInterface.sequelize.query(
      'SELECT id FROM environments ORDER BY id ASC LIMIT 1',
      { type: QueryTypes.SELECT }
    );
    if (!environment) return;

    const password = await bcrypt.hash('TimeOutDev#2026', 10);
    const now = new Date();
    const demoUsers = [
      { name: 'Equipe Time Out', email: 'platform@timeout.local', role: 'platform_admin', environmentId: null, phone: '12999990001' },
      { name: 'Administrador do Ambiente', email: 'admin.ambiente@timeout.local', role: 'environment_admin', environmentId: environment.id, phone: '12999990003' },
      { name: 'Cliente de Teste', email: 'cliente@timeout.local', role: 'customer', environmentId: environment.id, phone: '12999990004' },
      { name: 'Vendedor Pendente', email: 'pendente@timeout.local', role: 'customer', environmentId: environment.id, phone: '12999990002', cpf: '10000000019', cpfVerifiedAt: now },
    ];
    const existing = await queryInterface.sequelize.query(
      'SELECT email FROM users WHERE email IN (:emails)',
      { replacements: { emails: demoUsers.map((user) => user.email) }, type: QueryTypes.SELECT }
    );
    const existingEmails = new Set(existing.map((user) => user.email));
    const missing = demoUsers.filter((user) => !existingEmails.has(user.email)).map((user) => ({
      ...user,
      password,
      emailVerifiedAt: now,
      verificationChannel: 'email',
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
    }));
    if (missing.length) await queryInterface.bulkInsert('users', missing);

    const members = await queryInterface.sequelize.query(
      `SELECT id, email, role FROM ${q('users')} WHERE email IN (:emails)`,
      { replacements: { emails: demoUsers.filter((user) => user.environmentId).map((user) => user.email) }, type: QueryTypes.SELECT }
    );
    for (const member of members) {
      const [membership] = await queryInterface.sequelize.query(
        `SELECT id FROM ${q('user_environments')} WHERE ${q('userId')} = :userId AND ${q('environmentId')} = :environmentId LIMIT 1`,
        { replacements: { userId: member.id, environmentId: environment.id }, type: QueryTypes.SELECT }
      );
      if (!membership) {
        await queryInterface.bulkInsert('user_environments', [{
          userId: member.id,
          environmentId: environment.id,
          role: member.role === 'environment_admin' ? 'environment_admin' : 'customer',
          status: 'approved',
          createdAt: now,
          updatedAt: now,
        }]);
      }
    }

    const [pendingUser] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email LIMIT 1',
      { replacements: { email: 'pendente@timeout.local' }, type: QueryTypes.SELECT }
    );
    if (!pendingUser) return;

    const [request] = await queryInterface.sequelize.query(
      `SELECT id FROM ${q('seller_requests')} WHERE ${q('userId')} = :userId AND ${q('environmentId')} = :environmentId LIMIT 1`,
      { replacements: { userId: pendingUser.id, environmentId: environment.id }, type: QueryTypes.SELECT }
    );
    if (!request) {
      await queryInterface.bulkInsert('seller_requests', [{
        userId: pendingUser.id,
        environmentId: environment.id,
        status: 'pending',
        requestedAt: now,
        fullName: 'Vendedor Pendente',
        birthDate: '2000-01-01',
        phone: '12999990002',
        storeName: 'Loja de Teste',
        activityDescription: 'Venda demonstrativa de alimentos no ambiente.',
        productCategories: JSON.stringify(['Salgados']),
        reason: 'Testar o fluxo completo de aprovação interna.',
        acceptedTerms: true,
        history: JSON.stringify([{ status: 'pending', actorId: pendingUser.id, at: now.toISOString() }]),
        createdAt: now,
        updatedAt: now,
      }]);
    }
  },

  async down(queryInterface) {
    if (process.env.NODE_ENV === 'production') return;
    await queryInterface.bulkDelete('users', { email: ['platform@timeout.local', 'admin.ambiente@timeout.local', 'cliente@timeout.local', 'pendente@timeout.local'] });
  },
};
