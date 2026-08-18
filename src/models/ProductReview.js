const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ProductReview = sequelize.define(
    'ProductReview',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      productId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'products',
          key: 'id',
        },
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
      },
      rating: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: {
          min: 1,
          max: 5,
        },
      },
      comment: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      tableName: 'product_reviews',
      timestamps: true,
    }
  );

  ProductReview.associate = (models) => {
    ProductReview.belongsTo(models.Product, {
      foreignKey: 'productId',
      as: 'product',
    });

    ProductReview.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user',
    });
  };

  return ProductReview;
};
