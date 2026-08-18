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

    await queryInterface.sequelize.query(`
      UPDATE orders
      SET
        platformFeeRate = CASE
          WHEN totalPrice <= 10 THEN 8
          WHEN totalPrice <= 50 THEN 10
          ELSE 12
        END,
        platformFeeAmount = ROUND(totalPrice * (
          CASE
            WHEN totalPrice <= 10 THEN 0.08
            WHEN totalPrice <= 50 THEN 0.10
            ELSE 0.12
          END
        ), 2),
        sellerNetAmount = ROUND(totalPrice - ROUND(totalPrice * (
          CASE
            WHEN totalPrice <= 10 THEN 0.08
            WHEN totalPrice <= 50 THEN 0.10
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
