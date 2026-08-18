const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentSetting = sequelize.define(
    'PaymentSetting',
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
      provider: {
        type: DataTypes.ENUM('manual', 'mercado_pago'),
        allowNull: false,
        defaultValue: 'mercado_pago',
      },
      providerAccountId: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      acceptsPix: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      acceptsCreditCard: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      acceptsDebitCard: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      acceptsCash: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      acceptsCardInPerson: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      acceptsArrangeWithSeller: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
    },
    {
      tableName: 'payment_settings',
      timestamps: true,
    }
  );

  PaymentSetting.associate = (models) => {
    PaymentSetting.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'seller',
    });

    PaymentSetting.belongsTo(models.Environment, {
      foreignKey: 'environmentId',
      as: 'environment',
    });
  };

  return PaymentSetting;
};
