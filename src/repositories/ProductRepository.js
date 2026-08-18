const { Op } = require('sequelize');
const { Product, Category, User } = require('../models');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');

const productIncludes = [
  { model: Category, as: 'category' },
  { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone', 'profileImageUrl', 'role'] },
];

class ProductRepository {
  async create(data) {
    return Product.create(data);
  }

  async findAll({
    environmentId,
    sellerId,
    categoryId,
    search,
    minPrice,
    maxPrice,
    onlyAvailable = false,
    page = 1,
    limit = 10,
  } = {}) {
    const pagination = getPagination({ page, limit });
    const where = {};

    if (environmentId) where.environmentId = environmentId;
    if (sellerId) where.userId = sellerId;
    if (categoryId) where.categoryId = categoryId;
    if (search) where.name = { [Op.like]: `%${search}%` };
    if (onlyAvailable) {
      where.isActive = true;
      where.quantity = { [Op.gt]: 0 };
    }
    if (minPrice || maxPrice) {
      where.price = {};
      if (minPrice) where.price[Op.gte] = minPrice;
      if (maxPrice) where.price[Op.lte] = maxPrice;
    }

    const { count, rows } = await Product.findAndCountAll({
      where,
      include: productIncludes,
      limit: pagination.limit,
      offset: pagination.offset,
      order: [['createdAt', 'DESC']],
    });

    return {
      products: rows,
      ...buildPaginationMeta({ count, page: pagination.page, limit: pagination.limit }),
    };
  }

  async findById(id) {
    return Product.findByPk(id, { include: productIncludes });
  }

  async findByIdForUpdate(id, transaction) {
    return Product.findByPk(id, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
  }

  async update(id, data) {
    const product = await Product.findByPk(id);
    if (!product) return null;

    await product.update(data);
    return this.findById(id);
  }

  async delete(id) {
    const product = await Product.findByPk(id);
    if (!product) return false;

    await product.destroy();
    return true;
  }
}

module.exports = new ProductRepository();
