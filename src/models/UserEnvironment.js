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
        type: DataTypes.ENUM('customer', 'seller', 'admin'),
        allowNull: false,
        defaultValue: 'customer',
      },
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
  };

  return UserEnvironment;
};
