'use strict';

const now = () => new Date();

module.exports = {
  async up(queryInterface) {
    const q = (identifier) => queryInterface.quoteIdentifier(identifier);
    await queryInterface.sequelize.query(
      `UPDATE users
       SET ${q('emailVerifiedAt')} = COALESCE(${q('emailVerifiedAt')}, :now),
           ${q('emailVerificationCode')} = NULL,
           ${q('emailVerificationExpiresAt')} = NULL
       WHERE email IN (:emails)`,
      {
        replacements: {
          now: now(),
          emails: ['admin@localfood.com', 'vendedor@localfood.com', 'mateus@localfood.com'],
        },
      }
    );

    await queryInterface.sequelize.query(
      `UPDATE users
       SET cpf = :cpf,
           ${q('cpfVerifiedAt')} = COALESCE(${q('cpfVerifiedAt')}, :now)
       WHERE email = :email`,
      {
        replacements: {
          cpf: '52998224725',
          now: now(),
          email: 'vendedor@localfood.com',
        },
      }
    );

    await queryInterface.sequelize.query(
      `UPDATE users
       SET cpf = :cpf,
           ${q('cpfVerifiedAt')} = COALESCE(${q('cpfVerifiedAt')}, :now)
       WHERE email = :email`,
      {
        replacements: {
          cpf: '11144477735',
          now: now(),
          email: 'admin@localfood.com',
        },
      }
    );
  },

  async down(queryInterface) {
    const cpfVerifiedAt = queryInterface.quoteIdentifier('cpfVerifiedAt');
    await queryInterface.sequelize.query(
      `UPDATE users
       SET cpf = NULL,
           ${cpfVerifiedAt} = NULL
       WHERE email IN (:emails)`,
      {
        replacements: {
          emails: ['admin@localfood.com', 'vendedor@localfood.com'],
        },
      }
    );
  },
};
