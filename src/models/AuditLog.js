const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    actorId: { type: DataTypes.INTEGER, allowNull: true },
    action: { type: DataTypes.STRING(100), allowNull: false },
    resourceType: { type: DataTypes.STRING(80), allowNull: false },
    resourceId: { type: DataTypes.STRING(80), allowNull: true },
    environmentId: { type: DataTypes.INTEGER, allowNull: true },
    summary: { type: DataTypes.STRING(500), allowNull: false },
    metadata: { type: DataTypes.JSON, allowNull: true },
  }, { tableName: 'audit_logs', timestamps: true });
  AuditLog.associate = (models) => {
    AuditLog.belongsTo(models.User, { foreignKey: 'actorId', as: 'actor' });
    AuditLog.belongsTo(models.Environment, { foreignKey: 'environmentId', as: 'environment' });
  };
  return AuditLog;
};
