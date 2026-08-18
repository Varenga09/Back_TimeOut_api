'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'phoneVerifiedAt', {
      type: Sequelize.DATE,
      allowNull: true,
      after: 'phone',
    });

    await queryInterface.addColumn('users', 'verificationChannel', {
      type: Sequelize.ENUM('email', 'sms', 'whatsapp'),
      allowNull: false,
      defaultValue: 'email',
      after: 'emailVerificationExpiresAt',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'verificationChannel');
    await queryInterface.removeColumn('users', 'phoneVerifiedAt');
  },
};
