'use strict';

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkUpdate(
      'orders',
      {
        paymentStatus: 'paid',
        paymentProvider: 'mock',
        isPaymentSimulated: true,
        paidAt: now,
      },
      { paymentStatus: 'awaiting_payment' }
    );

    await queryInterface.bulkUpdate(
      'mock_transactions',
      { status: 'approved', simulatedAt: now },
      { status: 'pending' }
    );
  },

  async down() {
    // Payment approvals are intentionally not reverted because their previous
    // state cannot be recovered safely after sellers advance the orders.
  },
};
