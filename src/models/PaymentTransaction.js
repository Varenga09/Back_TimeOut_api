const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const PaymentTransaction = sequelize.define(
    'PaymentTransaction',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      orderId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      sellerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      environmentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      provider: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'mercado_pago',
      },
      providerPaymentId: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      providerPreferenceId: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      externalReference: {
        type: DataTypes.STRING(120),
        allowNull: false,
      },
      method: {
        type: DataTypes.ENUM('pix', 'credit_card', 'debit_card'),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM('pending', 'in_process', 'approved', 'rejected', 'cancelled', 'refunded', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      paidAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      qrCode: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      qrCodeBase64: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
      },
      checkoutUrl: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      failureReason: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      rawResponse: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
      },
      paidAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'payment_transactions',
      timestamps: true,
    }
  );

  PaymentTransaction.associate = (models) => {
    PaymentTransaction.belongsTo(models.Order, {
      foreignKey: 'orderId',
      as: 'order',
    });

    PaymentTransaction.belongsTo(models.User, {
      foreignKey: 'customerId',
      as: 'customer',
    });

    PaymentTransaction.belongsTo(models.User, {
      foreignKey: 'sellerId',
      as: 'seller',
    });

    PaymentTransaction.belongsTo(models.Environment, {
      foreignKey: 'environmentId',
      as: 'environment',
    });
  };

  return PaymentTransaction;
};
