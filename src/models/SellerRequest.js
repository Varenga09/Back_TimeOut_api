const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SellerRequest = sequelize.define('SellerRequest', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    environmentId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'under_review', 'changes_requested', 'approved', 'rejected', 'suspended', 'revoked', 'blocked'), allowNull: false, defaultValue: 'pending' },
    requestedAt: { type: DataTypes.DATE, allowNull: false },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    reviewedBy: { type: DataTypes.INTEGER, allowNull: true },
    fullName: { type: DataTypes.STRING(120), allowNull: true },
    birthDate: { type: DataTypes.DATEONLY, allowNull: true },
    phone: { type: DataTypes.STRING(30), allowNull: true },
    storeName: { type: DataTypes.STRING(120), allowNull: true },
    activityDescription: { type: DataTypes.TEXT, allowNull: true },
    productCategories: { type: DataTypes.JSON, allowNull: true },
    reason: { type: DataTypes.TEXT, allowNull: true },
    acceptedTerms: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    decisionReason: { type: DataTypes.TEXT, allowNull: true },
    correctionNotes: { type: DataTypes.TEXT, allowNull: true },
    history: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  }, { tableName: 'seller_requests', timestamps: true });

  SellerRequest.associate = (models) => {
    SellerRequest.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    SellerRequest.belongsTo(models.User, { foreignKey: 'reviewedBy', as: 'reviewer' });
    SellerRequest.belongsTo(models.Environment, { foreignKey: 'environmentId', as: 'environment' });
  };
  return SellerRequest;
};
