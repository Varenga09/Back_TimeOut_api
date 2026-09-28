const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SellerRequest = sequelize.define('SellerRequest', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    environmentId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'approved', 'rejected', 'blocked'), allowNull: false, defaultValue: 'pending' },
    requestedAt: { type: DataTypes.DATE, allowNull: false },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    reviewedBy: { type: DataTypes.INTEGER, allowNull: true },
  }, { tableName: 'seller_requests', timestamps: true });

  SellerRequest.associate = (models) => {
    SellerRequest.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    SellerRequest.belongsTo(models.User, { foreignKey: 'reviewedBy', as: 'reviewer' });
    SellerRequest.belongsTo(models.Environment, { foreignKey: 'environmentId', as: 'environment' });
  };
  return SellerRequest;
};
