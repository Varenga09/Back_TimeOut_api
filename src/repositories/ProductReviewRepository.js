const { fn, col } = require('sequelize');
const { ProductReview, User } = require('../models');

class ProductReviewRepository {
  async findByProductId(productId) {
    return ProductReview.findAll({
      where: { productId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'profileImageUrl', 'role'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
  }

  async findByProductAndUser(productId, userId) {
    return ProductReview.findOne({
      where: { productId, userId },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'profileImageUrl', 'role'],
        },
      ],
    });
  }

  async save(data) {
    const existingReview = await ProductReview.findOne({
      where: {
        productId: data.productId,
        userId: data.userId,
      },
    });

    if (existingReview) {
      await existingReview.update({
        rating: data.rating,
        comment: data.comment,
      });

      return this.findByProductAndUser(data.productId, data.userId);
    }

    const review = await ProductReview.create(data);
    return this.findByProductAndUser(review.productId, review.userId);
  }

  async getSummary(productId) {
    const [summary] = await ProductReview.findAll({
      where: { productId },
      attributes: [
        [fn('AVG', col('rating')), 'averageRating'],
        [fn('COUNT', col('id')), 'reviewsCount'],
      ],
      raw: true,
    });

    const averageRating = summary?.averageRating ? Number(Number(summary.averageRating).toFixed(1)) : 0;

    return {
      averageRating,
      reviewsCount: Number(summary?.reviewsCount || 0),
    };
  }
}

module.exports = new ProductReviewRepository();
