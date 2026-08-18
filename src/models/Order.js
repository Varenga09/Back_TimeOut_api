const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Order = sequelize.define(
    'Order',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      customerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      sellerId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      environmentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'environments',
          key: 'id',
        },
      },
      status: {
        type: DataTypes.ENUM(
          'pending',
          'accepted',
          'preparing',
          'ready',
          'delivered',
          'canceled',
          'refused'
        ),
        allowNull: false,
        defaultValue: 'pending',
      },
      totalPrice: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      couponId: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      couponCode: {
        type: DataTypes.STRING(40),
        allowNull: true,
      },
      couponDiscount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      platformFeeRate: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
      },
      platformFeeAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      sellerNetAmount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      paymentMethod: {
        type: DataTypes.ENUM(
          'cash',
          'pix',
          'credit_card',
          'debit_card',
          'card_in_person',
          'arrange_with_seller'
        ),
        allowNull: false,
      },
      paymentStatus: {
        type: DataTypes.ENUM('not_required', 'awaiting_payment', 'paid', 'failed', 'refunded'),
        allowNull: false,
        defaultValue: 'not_required',
      },
      paymentProvider: {
        type: DataTypes.STRING(40),
        allowNull: false,
        defaultValue: 'manual',
      },
      paidAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      deliveryType: {
        type: DataTypes.ENUM('pickup', 'internal_delivery', 'meeting_point'),
        allowNull: false,
      },
      deliveryLocation: {
        type: DataTypes.STRING(120),
        allowNull: true,
      },
      observation: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'orders',
      timestamps: true,
    }
  );

  Order.associate = (models) => {
    Order.belongsTo(models.User, {
      foreignKey: 'customerId',
      as: 'customer',
    });

    Order.belongsTo(models.User, {
      foreignKey: 'sellerId',
      as: 'seller',
    });

    Order.belongsTo(models.Environment, {
      foreignKey: 'environmentId',
      as: 'environment',
    });

    Order.hasMany(models.OrderItem, {
      foreignKey: 'orderId',
      as: 'items',
      onDelete: 'CASCADE',
    });

    Order.belongsTo(models.Coupon, {
      foreignKey: 'couponId',
      as: 'coupon',
    });

    Order.hasMany(models.PaymentTransaction, {
      foreignKey: 'orderId',
      as: 'paymentTransactions',
      onDelete: 'CASCADE',
    });
  };

  return Order;
};
