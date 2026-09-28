const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EnvironmentAccessCode = sequelize.define('EnvironmentAccessCode', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    environmentId: { type: DataTypes.INTEGER, allowNull: false },
    codeHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    codePreview: { type: DataTypes.STRING(30), allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdBy: { type: DataTypes.INTEGER, allowNull: true },
    revokedAt: { type: DataTypes.DATE, allowNull: true },
  }, { tableName: 'environment_access_codes', timestamps: true });
  EnvironmentAccessCode.associate = (models) => {
    EnvironmentAccessCode.belongsTo(models.Environment, { foreignKey: 'environmentId', as: 'environment' });
    EnvironmentAccessCode.belongsTo(models.User, { foreignKey: 'createdBy', as: 'creator' });
  };
  return EnvironmentAccessCode;
};
