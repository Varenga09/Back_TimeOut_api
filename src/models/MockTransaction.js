const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MockTransaction = sequelize.define('MockTransaction', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    customerId: { type: DataTypes.INTEGER, allowNull: false },
    sellerId: { type: DataTypes.INTEGER, allowNull: false },
    environmentId: { type: DataTypes.INTEGER, allowNull: false },
    paymentMethod: { type: DataTypes.STRING(40), allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'approved', 'held', 'settled', 'declined', 'refunded'), allowNull: false, defaultValue: 'pending' },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    grossAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    commissionRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
    platformFeeAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    sellerNetAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    simulatedAt: { type: DataTypes.DATE, allowNull: false },
    isSimulated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    heldAt: { type: DataTypes.DATE, allowNull: true },
    settledAt: { type: DataTypes.DATE, allowNull: true },
    refundedAt: { type: DataTypes.DATE, allowNull: true },
    idempotencyKey: { type: DataTypes.STRING(100), allowNull: true, unique: true },
    principalOrderId: { type: DataTypes.INTEGER, allowNull: true, unique: true },
    settlementBlockedAt: { type: DataTypes.DATE, allowNull: true },
    settlementBlockedReason: { type: DataTypes.STRING(255), allowNull: true },
    settlementReleasedBy: { type: DataTypes.INTEGER, allowNull: true },
    history: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  }, { tableName: 'mock_transactions', timestamps: true });

  MockTransaction.associate = (models) => {
    MockTransaction.belongsTo(models.Order, { foreignKey: 'orderId', as: 'order' });
    MockTransaction.belongsTo(models.User, { foreignKey: 'customerId', as: 'customer' });
    MockTransaction.belongsTo(models.User, { foreignKey: 'sellerId', as: 'seller' });
    MockTransaction.belongsTo(models.Environment, { foreignKey: 'environmentId', as: 'environment' });
    MockTransaction.belongsTo(models.User, { foreignKey: 'settlementReleasedBy', as: 'settlementReleaser' });
  };
  return MockTransaction;
};
