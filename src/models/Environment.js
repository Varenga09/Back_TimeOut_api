const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Environment = sequelize.define(
    'Environment',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      type: {
        type: DataTypes.ENUM('school', 'company', 'factory', 'college', 'office', 'other'),
        allowNull: false,
        defaultValue: 'other',
      },
      accessCode: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true,
      },
      address: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
    },
    {
      tableName: 'environments',
      timestamps: true,
    }
  );

  Environment.associate = (models) => {
    Environment.hasMany(models.User, {
      foreignKey: 'environmentId',
      as: 'users',
    });

    Environment.hasMany(models.Product, {
      foreignKey: 'environmentId',
      as: 'products',
    });

    Environment.hasMany(models.Order, {
      foreignKey: 'environmentId',
      as: 'orders',
    });

    Environment.hasMany(models.UserEnvironment, {
      foreignKey: 'environmentId',
      as: 'memberships',
    });

    Environment.hasMany(models.Coupon, {
      foreignKey: 'environmentId',
      as: 'coupons',
    });

    Environment.hasMany(models.PaymentSetting, {
      foreignKey: 'environmentId',
      as: 'paymentSettings',
    });

    Environment.hasMany(models.PaymentTransaction, {
      foreignKey: 'environmentId',
      as: 'paymentTransactions',
    });
  };

  return Environment;
};
