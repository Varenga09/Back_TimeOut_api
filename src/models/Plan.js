const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Plan = sequelize.define('Plan', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(30), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(80), allowNull: false },
    monthlyPrice: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
    commissionRate: { type: DataTypes.DECIMAL(5, 2), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    features: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
    isExperimental: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  }, { tableName: 'plans', timestamps: true });

  Plan.associate = (models) => {
    Plan.hasMany(models.Subscription, { foreignKey: 'planId', as: 'subscriptions' });
  };
  return Plan;
};
