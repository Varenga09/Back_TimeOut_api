const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Notification = sequelize.define('Notification', {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(160), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    type: { type: DataTypes.STRING(50), allowNull: false },
    internalLink: { type: DataTypes.STRING(255), allowNull: true },
    readAt: { type: DataTypes.DATE, allowNull: true },
  }, { tableName: 'notifications', timestamps: true });
  Notification.associate = (models) => Notification.belongsTo(models.User, { foreignKey: 'userId', as: 'recipient' });
  return Notification;
};
