'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('products', 'discountType', {
      type: Sequelize.ENUM('percentage', 'fixed'),
      allowNull: true,
    });

    await queryInterface.addColumn('products', 'discountValue', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });

    await queryInterface.addColumn('products', 'discountStartsAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.addColumn('products', 'discountEndsAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });

    await queryInterface.createTable('coupons', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false,
      },
      code: {
        type: Sequelize.STRING(40),
        allowNull: false,
        unique: true,
      },
      description: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      discountType: {
        type: Sequelize.ENUM('percentage', 'fixed'),
        allowNull: false,
      },
      discountValue: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      startsAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      endsAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      usageLimit: {
        type: Sequelize.INTEGER,
        allowNull: true,
      },
      usedCount: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      isActive: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addColumn('orders', 'couponId', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: {
        model: 'coupons',
        key: 'id',
      },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    });

    await queryInterface.addColumn('orders', 'couponCode', {
      type: Sequelize.STRING(40),
      allowNull: true,
    });

    await queryInterface.addColumn('orders', 'couponDiscount', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'couponDiscount');
    await queryInterface.removeColumn('orders', 'couponCode');
    await queryInterface.removeColumn('orders', 'couponId');
    await queryInterface.dropTable('coupons');
    await queryInterface.removeColumn('products', 'discountEndsAt');
    await queryInterface.removeColumn('products', 'discountStartsAt');
    await queryInterface.removeColumn('products', 'discountValue');
    await queryInterface.removeColumn('products', 'discountType');
  },
};
