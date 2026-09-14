'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('orders', 'platformFeeRate', {
      type: Sequelize.DECIMAL(5, 2),
      allowNull: false,
      defaultValue: 0,
      after: 'couponDiscount',
    });

    await queryInterface.addColumn('orders', 'platformFeeAmount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      after: 'platformFeeRate',
    });

    await queryInterface.addColumn('orders', 'sellerNetAmount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      after: 'platformFeeAmount',
    });

    const q = (identifier) => queryInterface.quoteIdentifier(identifier);
    await queryInterface.sequelize.query(`
      UPDATE orders
      SET
        ${q('platformFeeRate')} = CASE
          WHEN ${q('totalPrice')} <= 10 THEN 8
          WHEN ${q('totalPrice')} <= 50 THEN 10
          ELSE 12
        END,
        ${q('platformFeeAmount')} = ROUND(${q('totalPrice')} * (
          CASE
            WHEN ${q('totalPrice')} <= 10 THEN 0.08
            WHEN ${q('totalPrice')} <= 50 THEN 0.10
            ELSE 0.12
          END
        ), 2),
        ${q('sellerNetAmount')} = ROUND(${q('totalPrice')} - ROUND(${q('totalPrice')} * (
          CASE
            WHEN ${q('totalPrice')} <= 10 THEN 0.08
            WHEN ${q('totalPrice')} <= 50 THEN 0.10
            ELSE 0.12
          END
        ), 2), 2)
    `);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'sellerNetAmount');
    await queryInterface.removeColumn('orders', 'platformFeeAmount');
    await queryInterface.removeColumn('orders', 'platformFeeRate');
  },
};
