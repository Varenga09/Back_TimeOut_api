'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    const q = (name) => queryInterface.quoteIdentifier(name);
    const addEnumValue = async (type, value) => {
      if (dialect === 'postgres') {
        await queryInterface.sequelize.query(`ALTER TYPE "${type}" ADD VALUE IF NOT EXISTS '${value}'`);
      }
    };

    for (const status of ['held', 'settled', 'refunded']) {
      await addEnumValue('enum_mock_transactions_status', status);
    }
    for (const status of ['pending', 'approved', 'held', 'settled', 'declined']) {
      await addEnumValue('enum_orders_paymentStatus', status);
    }

    if (dialect !== 'postgres') {
      await queryInterface.changeColumn('mock_transactions', 'status', {
        type: Sequelize.ENUM('pending', 'approved', 'held', 'settled', 'declined', 'refunded'),
        allowNull: false,
        defaultValue: 'pending',
      });
      await queryInterface.changeColumn('orders', 'paymentStatus', {
        type: Sequelize.ENUM('not_required', 'awaiting_payment', 'paid', 'failed', 'pending', 'approved', 'held', 'settled', 'declined', 'refunded'),
        allowNull: false,
        defaultValue: 'not_required',
      });
    }

    await queryInterface.createTable('seller_payout_accounts', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      environmentId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'environments', key: 'id' }, onDelete: 'CASCADE' },
      responsibleName: { type: Sequelize.STRING(120), allowNull: false },
      storeName: { type: Sequelize.STRING(120), allowNull: false },
      testAccountId: { type: Sequelize.STRING(40), allowNull: false, unique: true },
      status: { type: Sequelize.ENUM('not_connected', 'pending', 'connected', 'suspended'), allowNull: false, defaultValue: 'not_connected' },
      acceptedTestTermsAt: { type: Sequelize.DATE, allowNull: true },
      connectedAt: { type: Sequelize.DATE, allowNull: true },
      suspendedAt: { type: Sequelize.DATE, allowNull: true },
      suspendedBy: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('seller_payout_accounts', ['userId', 'environmentId'], { unique: true, name: 'seller_payout_accounts_user_environment_unique' });

    const transactionColumns = {
      grossAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      commissionRate: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      platformFeeAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      sellerNetAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      approvedAt: { type: Sequelize.DATE, allowNull: true },
      heldAt: { type: Sequelize.DATE, allowNull: true },
      settledAt: { type: Sequelize.DATE, allowNull: true },
      refundedAt: { type: Sequelize.DATE, allowNull: true },
      idempotencyKey: { type: Sequelize.STRING(100), allowNull: true },
      history: { type: Sequelize.JSON, allowNull: false, defaultValue: [] },
    };
    for (const [name, definition] of Object.entries(transactionColumns)) {
      await queryInterface.addColumn('mock_transactions', name, definition);
    }
    await queryInterface.addIndex('mock_transactions', ['idempotencyKey'], { unique: true, name: 'mock_transactions_idempotency_unique' });

    await queryInterface.sequelize.query(`
      UPDATE ${q('mock_transactions')}
      SET ${q('grossAmount')} = ${q('amount')},
          ${q('commissionRate')} = COALESCE((SELECT ${q('commissionRate')} FROM ${q('orders')} WHERE ${q('orders')}.${q('id')} = ${q('mock_transactions')}.${q('orderId')}), 0)
    `);
    await queryInterface.sequelize.query(`
      UPDATE ${q('mock_transactions')}
      SET ${q('platformFeeAmount')} = ROUND(${q('grossAmount')} * ${q('commissionRate')} / 100, 2),
          ${q('sellerNetAmount')} = ${q('grossAmount')} - ROUND(${q('grossAmount')} * ${q('commissionRate')} / 100, 2)
      WHERE ${q('status')} = 'approved'
    `);
    await queryInterface.sequelize.query(`
      UPDATE ${q('mock_transactions')}
      SET ${q('status')} = CASE
        WHEN EXISTS (SELECT 1 FROM ${q('orders')} WHERE ${q('orders')}.${q('id')} = ${q('mock_transactions')}.${q('orderId')} AND ${q('orders')}.${q('status')} = 'delivered') THEN 'settled'
        ELSE 'held'
      END,
      ${q('approvedAt')} = COALESCE(${q('simulatedAt')}, ${q('updatedAt')}),
      ${q('heldAt')} = COALESCE(${q('simulatedAt')}, ${q('updatedAt')}),
      ${q('settledAt')} = CASE
        WHEN EXISTS (SELECT 1 FROM ${q('orders')} WHERE ${q('orders')}.${q('id')} = ${q('mock_transactions')}.${q('orderId')} AND ${q('orders')}.${q('status')} = 'delivered') THEN COALESCE(${q('simulatedAt')}, ${q('updatedAt')})
        ELSE NULL
      END
      WHERE ${q('status')} = 'approved'
    `);
    await queryInterface.sequelize.query(`UPDATE ${q('orders')} SET ${q('paymentStatus')} = 'pending' WHERE ${q('paymentStatus')} = 'awaiting_payment'`);
    await queryInterface.sequelize.query(`UPDATE ${q('orders')} SET ${q('paymentStatus')} = CASE WHEN ${q('status')} = 'delivered' THEN 'settled' ELSE 'held' END WHERE ${q('paymentStatus')} = 'paid'`);
    await queryInterface.sequelize.query(`UPDATE ${q('orders')} SET ${q('paymentStatus')} = 'declined' WHERE ${q('paymentStatus')} = 'failed'`);
  },

  async down() {
    // Financial history is intentionally preserved.
  },
};
