const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SellerPayoutAccount = sequelize.define('SellerPayoutAccount', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    environmentId: { type: DataTypes.INTEGER, allowNull: false },
    responsibleName: { type: DataTypes.STRING(120), allowNull: false },
    storeName: { type: DataTypes.STRING(120), allowNull: false },
    testAccountId: { type: DataTypes.STRING(40), allowNull: false, unique: true },
    status: { type: DataTypes.ENUM('not_connected', 'pending', 'connected', 'suspended'), allowNull: false, defaultValue: 'not_connected' },
    acceptedTestTermsAt: { type: DataTypes.DATE, allowNull: true },
    connectedAt: { type: DataTypes.DATE, allowNull: true },
    suspendedAt: { type: DataTypes.DATE, allowNull: true },
    suspendedBy: { type: DataTypes.INTEGER, allowNull: true },
  }, { tableName: 'seller_payout_accounts', timestamps: true });

  SellerPayoutAccount.associate = (models) => {
    SellerPayoutAccount.belongsTo(models.User, { foreignKey: 'userId', as: 'seller' });
    SellerPayoutAccount.belongsTo(models.Environment, { foreignKey: 'environmentId', as: 'environment' });
    SellerPayoutAccount.belongsTo(models.User, { foreignKey: 'suspendedBy', as: 'suspender' });
  };
  return SellerPayoutAccount;
};
