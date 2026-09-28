const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EnvironmentApplication = sequelize.define('EnvironmentApplication', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('pending', 'under_review', 'changes_requested', 'approved', 'rejected', 'suspended', 'revoked'), allowNull: false, defaultValue: 'pending' },
    responsibleName: { type: DataTypes.STRING(120), allowNull: false },
    cpf: { type: DataTypes.STRING(11), allowNull: false },
    phone: { type: DataTypes.STRING(30), allowNull: false },
    institutionName: { type: DataTypes.STRING(160), allowNull: false },
    institutionType: { type: DataTypes.STRING(50), allowNull: false },
    cnpj: { type: DataTypes.STRING(14), allowNull: true },
    address: { type: DataTypes.STRING(255), allowNull: false },
    relationship: { type: DataTypes.STRING(160), allowNull: false },
    justification: { type: DataTypes.TEXT, allowNull: false },
    environmentDescription: { type: DataTypes.TEXT, allowNull: false },
    documentPath: { type: DataTypes.STRING(500), allowNull: true },
    environmentId: { type: DataTypes.INTEGER, allowNull: true },
    reviewedBy: { type: DataTypes.INTEGER, allowNull: true },
    decisionReason: { type: DataTypes.TEXT, allowNull: true },
    correctionNotes: { type: DataTypes.TEXT, allowNull: true },
    decidedAt: { type: DataTypes.DATE, allowNull: true },
    history: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  }, { tableName: 'environment_applications', timestamps: true });

  EnvironmentApplication.associate = (models) => {
    EnvironmentApplication.belongsTo(models.User, { foreignKey: 'userId', as: 'applicant' });
    EnvironmentApplication.belongsTo(models.User, { foreignKey: 'reviewedBy', as: 'reviewer' });
    EnvironmentApplication.belongsTo(models.Environment, { foreignKey: 'environmentId', as: 'environment' });
  };
  return EnvironmentApplication;
};
