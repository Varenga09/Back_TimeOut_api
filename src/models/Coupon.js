const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Coupon = sequelize.define(
    'Coupon',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      code: {
        type: DataTypes.STRING(40),
        allowNull: false,
        unique: true,
        set(value) {
          this.setDataValue('code', String(value || '').trim().toUpperCase());
        },
      },
      description: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      discountType: {
        type: DataTypes.ENUM('percentage', 'fixed'),
        allowNull: false,
      },
      discountValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      startsAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      endsAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      usageLimit: {
        type: DataTypes.INTEGER,
        allowNull: true,
      },
      usedCount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      environmentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
    },
    {
      tableName: 'coupons',
      timestamps: true,
    }
  );

  Coupon.associate = (models) => {
    Coupon.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'seller',
    });

    Coupon.belongsTo(models.Environment, {
      foreignKey: 'environmentId',
      as: 'environment',
    });

    Coupon.hasMany(models.Order, {
      foreignKey: 'couponId',
      as: 'orders',
    });
  };

  return Coupon;
};
