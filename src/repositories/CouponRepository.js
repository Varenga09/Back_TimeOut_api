const { Op } = require('sequelize');
const { Coupon, User } = require('../models');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');

const couponIncludes = [
  { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone'] },
];

class CouponRepository {
  async create(data) {
    return Coupon.create(data);
  }

  async findAll({ environmentId, sellerId, search, page = 1, limit = 10 } = {}) {
    const pagination = getPagination({ page, limit });
    const where = {};

    if (environmentId) where.environmentId = environmentId;
    if (sellerId) where.userId = sellerId;
    if (search) {
      where[Op.or] = [
        { code: { [Op.like]: `%${String(search).toUpperCase()}%` } },
        { description: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Coupon.findAndCountAll({
      where,
      include: couponIncludes,
      limit: pagination.limit,
      offset: pagination.offset,
      order: [['createdAt', 'DESC']],
    });

    return {
      coupons: rows,
      ...buildPaginationMeta({ count, page: pagination.page, limit: pagination.limit }),
    };
  }

  async findById(id) {
    return Coupon.findByPk(id, { include: couponIncludes });
  }

  async findByCodeForOrder(code, sellerId, environmentId, transaction) {
    return Coupon.findOne({
      where: {
        code: String(code || '').trim().toUpperCase(),
        userId: sellerId,
        environmentId,
      },
      lock: transaction?.LOCK?.UPDATE,
      transaction,
    });
  }

  async update(id, data) {
    const coupon = await Coupon.findByPk(id);
    if (!coupon) return null;

    await coupon.update(data);
    return this.findById(id);
  }

  async delete(id) {
    const coupon = await Coupon.findByPk(id);
    if (!coupon) return false;

    await coupon.destroy();
    return true;
  }
}

module.exports = new CouponRepository();
