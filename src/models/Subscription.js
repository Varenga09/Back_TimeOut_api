const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Subscription = sequelize.define('Subscription', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    environmentId: { type: DataTypes.INTEGER, allowNull: false },
    planId: { type: DataTypes.INTEGER, allowNull: false },
    monthlyPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    commissionRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    startedAt: { type: DataTypes.DATE, allowNull: false },
    endedAt: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.ENUM('active', 'canceled'), allowNull: false, defaultValue: 'active' },
    isSimulated: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, { tableName: 'subscriptions', timestamps: true });

  Subscription.associate = (models) => {
    Subscription.belongsTo(models.User, { foreignKey: 'userId', as: 'seller' });
    Subscription.belongsTo(models.Environment, { foreignKey: 'environmentId', as: 'environment' });
    Subscription.belongsTo(models.Plan, { foreignKey: 'planId', as: 'plan' });
  };
  return Subscription;
};
