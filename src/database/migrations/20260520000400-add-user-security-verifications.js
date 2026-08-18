'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'emailVerifiedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'email',
    });

    await queryInterface.addColumn('users', 'emailVerificationCode', {
      type: Sequelize.STRING(10),
      allowNull: true,
      after: 'emailVerifiedAt',
    });

    await queryInterface.addColumn('users', 'emailVerificationExpiresAt', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'emailVerificationCode',
    });

    await queryInterface.addColumn('users', 'cpf', {
      type: Sequelize.STRING(11),
      allowNull: true,
      after: 'phone',
    });

    await queryInterface.addColumn('users', 'cpfVerifiedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'cpf',
    });

    await queryInterface.addIndex('users', ['cpf'], {
      unique: true,
      name: 'users_cpf_unique',
    });

    // Contas antigas do ambiente de desenvolvimento continuam usáveis.
    await queryInterface.sequelize.query(
      'UPDATE users SET emailVerifiedAt = NOW() WHERE emailVerifiedAt IS NULL'
    );
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('users', 'users_cpf_unique');
    await queryInterface.removeColumn('users', 'cpfVerifiedAt');
    await queryInterface.removeColumn('users', 'cpf');
    await queryInterface.removeColumn('users', 'emailVerificationExpiresAt');
    await queryInterface.removeColumn('users', 'emailVerificationCode');
    await queryInterface.removeColumn('users', 'emailVerifiedAt');
  },
};
