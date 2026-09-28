const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const UserEnvironment = sequelize.define(
    'UserEnvironment',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      environmentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      role: {
        type: DataTypes.ENUM('customer', 'seller', 'admin', 'environment_admin'),
        allowNull: false,
        defaultValue: 'customer',
      },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected', 'suspended'),
        allowNull: false,
        defaultValue: 'approved',
      },
      reviewedAt: { type: DataTypes.DATE, allowNull: true },
      reviewedBy: { type: DataTypes.INTEGER, allowNull: true },
    },
    {
      tableName: 'user_environments',
      timestamps: true,
    }
  );

  UserEnvironment.associate = (models) => {
    UserEnvironment.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });

    UserEnvironment.belongsTo(models.Environment, {
      foreignKey: 'environmentId',
      as: 'environment',
    });
    UserEnvironment.belongsTo(models.User, { foreignKey: 'reviewedBy', as: 'reviewer' });
  };

  return UserEnvironment;
};
