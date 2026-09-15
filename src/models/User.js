const bcrypt = require('bcrypt');
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const User = sequelize.define(
    'User',
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
      email: {
        type: DataTypes.STRING(150),
        allowNull: false,
        unique: true,
        validate: {
          isEmail: { msg: 'Informe um e-mail válido' },
        },
      },
      emailVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      emailVerificationCode: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      emailVerificationExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      verificationChannel: {
        type: DataTypes.ENUM('email', 'sms', 'whatsapp'),
        allowNull: false,
        defaultValue: 'email',
      },
      password: {
        type: DataTypes.STRING(255),
        allowNull: false,
      },
      passwordResetCodeHash: {
        type: DataTypes.STRING(64),
        allowNull: true,
      },
      passwordResetExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      tokenVersion: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      phone: {
        type: DataTypes.STRING(30),
        allowNull: true,
      },
      phoneVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      cpf: {
        type: DataTypes.STRING(11),
        allowNull: true,
        unique: true,
      },
      cpfVerifiedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      profileImageUrl: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      role: {
        type: DataTypes.ENUM('customer', 'seller', 'admin'),
        allowNull: false,
        defaultValue: 'customer',
      },
      environmentId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'environments',
          key: 'id',
        },
      },
    },
    {
      tableName: 'users',
      timestamps: true,
      hooks: {
        beforeCreate: async (user) => {
          const salt = await bcrypt.genSalt(10);
          user.password = await bcrypt.hash(user.password, salt);
        },
        beforeUpdate: async (user) => {
          if (user.changed('password')) {
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(user.password, salt);
          }
        },
      },
    }
  );

  User.prototype.comparePassword = async function (plainPassword) {
    return bcrypt.compare(plainPassword, this.password);
  };

  User.prototype.toJSON = function () {
    const values = { ...this.get() };
    delete values.password;
    delete values.emailVerificationCode;
    delete values.emailVerificationExpiresAt;
    delete values.passwordResetCodeHash;
    delete values.passwordResetExpiresAt;
    delete values.tokenVersion;
    delete values.cpf;
    return values;
  };

  User.associate = (models) => {
    User.belongsTo(models.Environment, {
      foreignKey: 'environmentId',
      as: 'environment',
    });

    User.hasMany(models.Product, {
      foreignKey: 'userId',
      as: 'products',
    });

    User.hasMany(models.Order, {
      foreignKey: 'customerId',
      as: 'customerOrders',
    });

    User.hasMany(models.Order, {
      foreignKey: 'sellerId',
      as: 'sellerOrders',
    });

    User.hasMany(models.ProductReview, {
      foreignKey: 'userId',
      as: 'productReviews',
    });

    User.hasMany(models.UserEnvironment, {
      foreignKey: 'userId',
      as: 'memberships',
    });

    User.hasMany(models.Coupon, {
      foreignKey: 'userId',
      as: 'coupons',
    });

    User.hasOne(models.PaymentSetting, {
      foreignKey: 'userId',
      as: 'paymentSetting',
    });

    User.hasMany(models.PaymentTransaction, {
      foreignKey: 'customerId',
      as: 'customerPaymentTransactions',
    });

    User.hasMany(models.PaymentTransaction, {
      foreignKey: 'sellerId',
      as: 'sellerPaymentTransactions',
    });
  };

  return User;
};
