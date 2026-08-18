const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Product = sequelize.define(
    'Product',
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
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      flavors: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
      },
      discountType: {
        type: DataTypes.ENUM('percentage', 'fixed'),
        allowNull: true,
      },
      discountValue: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
      },
      discountStartsAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      discountEndsAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      imageUrl: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      imageGallery: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      quantity: {
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
        references: {
          model: 'users',
          key: 'id',
        },
      },
      categoryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'categories',
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
    },
    {
      tableName: 'products',
      timestamps: true,
    }
  );

  Product.associate = (models) => {
    Product.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'seller',
    });

    Product.belongsTo(models.Category, {
      foreignKey: 'categoryId',
      as: 'category',
    });

    Product.belongsTo(models.Environment, {
      foreignKey: 'environmentId',
      as: 'environment',
    });

    Product.hasMany(models.OrderItem, {
      foreignKey: 'productId',
      as: 'orderItems',
    });

    Product.hasMany(models.ProductReview, {
      foreignKey: 'productId',
      as: 'reviews',
    });
  };

  return Product;
};
