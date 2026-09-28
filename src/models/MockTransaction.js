const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const MockTransaction = sequelize.define('MockTransaction', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    orderId: { type: DataTypes.INTEGER, allowNull: false },
    customerId: { type: DataTypes.INTEGER, allowNull: false },
    sellerId: { type: DataTypes.INTEGER, allowNull: false },
    environmentId: { type: DataTypes.INTEGER, allowNull: false },
    paymentMethod: { type: DataTypes.STRING(40), allowNull: false },
    status: { type: DataTypes.ENUM('approved', 'pending', 'declined'), allowNull: false, defaultValue: 'pending' },
    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    simulatedAt: { type: DataTypes.DATE, allowNull: false },
    isSimulated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, { tableName: 'mock_transactions', timestamps: true });

  MockTransaction.associate = (models) => {
    MockTransaction.belongsTo(models.Order, { foreignKey: 'orderId', as: 'order' });
    MockTransaction.belongsTo(models.User, { foreignKey: 'customerId', as: 'customer' });
    MockTransaction.belongsTo(models.User, { foreignKey: 'sellerId', as: 'seller' });
    MockTransaction.belongsTo(models.Environment, { foreignKey: 'environmentId', as: 'environment' });
  };
  return MockTransaction;
};
