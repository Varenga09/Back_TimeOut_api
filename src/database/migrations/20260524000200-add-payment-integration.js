'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('orders', 'paymentMethod', {
      type: Sequelize.ENUM(
        'cash',
        'pix',
        'credit_card',
        'debit_card',
        'card_in_person',
        'arrange_with_seller'
      ),
      allowNull: false,
    });

    await queryInterface.addColumn('orders', 'paymentStatus', {
      type: Sequelize.ENUM('not_required', 'awaiting_payment', 'paid', 'failed', 'refunded'),
      allowNull: false,
      defaultValue: 'not_required',
    });

    await queryInterface.addColumn('orders', 'paymentProvider', {
      type: Sequelize.STRING(40),
      allowNull: false,
      defaultValue: 'manual',
    });

    await queryInterface.addColumn('orders', 'paidAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.createTable('payment_settings', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      environmentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'environments',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      provider: {
        type: Sequelize.ENUM('manual', 'mercado_pago'),
        allowNull: false,
        defaultValue: 'mercado_pago',
      },
      providerAccountId: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      acceptsPix: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      acceptsCreditCard: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      acceptsDebitCard: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      acceptsCash: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      acceptsCardInPerson: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      acceptsArrangeWithSeller: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex('payment_settings', ['userId', 'environmentId'], {
      unique: true,
      name: 'payment_settings_user_environment_unique',
    });

    await queryInterface.createTable('payment_transactions', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      orderId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'orders',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      customerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      sellerId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      environmentId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'environments',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      provider: {
        type: Sequelize.STRING(40),
        allowNull: false,
        defaultValue: 'mercado_pago',
      },
      providerPaymentId: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      providerPreferenceId: {
        type: Sequelize.STRING(120),
        allowNull: true,
      },
      externalReference: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      method: {
        type: Sequelize.ENUM('pix', 'credit_card', 'debit_card'),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('pending', 'in_process', 'approved', 'rejected', 'cancelled', 'refunded', 'failed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      paidAmount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      qrCode: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      qrCodeBase64: {
        type: Sequelize.TEXT('long'),
        allowNull: true,
      },
      checkoutUrl: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      failureReason: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      rawResponse: {
        type: Sequelize.TEXT('long'),
        allowNull: true,
      },
      paidAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex('payment_transactions', ['orderId']);
    await queryInterface.addIndex('payment_transactions', ['providerPaymentId']);
    await queryInterface.addIndex('payment_transactions', ['externalReference']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('payment_transactions');
    await queryInterface.dropTable('payment_settings');
    await queryInterface.removeColumn('orders', 'paidAt');
    await queryInterface.removeColumn('orders', 'paymentProvider');
    await queryInterface.removeColumn('orders', 'paymentStatus');

    await queryInterface.changeColumn('orders', 'paymentMethod', {
      type: Sequelize.ENUM('cash', 'pix', 'card_in_person', 'arrange_with_seller'),
      allowNull: false,
    });
  },
};
