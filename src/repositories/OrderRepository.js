const { Order, OrderItem, Product, User, Category, Coupon, PaymentTransaction } = require('../models');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');

const orderIncludes = [
  { model: User, as: 'customer', attributes: ['id', 'name', 'email', 'phone', 'profileImageUrl'] },
  { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone', 'profileImageUrl'] },
  { model: Coupon, as: 'coupon' },
  {
    model: PaymentTransaction,
    as: 'paymentTransactions',
    separate: true,
    order: [['createdAt', 'DESC']],
  },
  {
    model: OrderItem,
    as: 'items',
    include: [
      {
        model: Product,
        as: 'product',
        include: [{ model: Category, as: 'category' }],
      },
    ],
  },
];

class OrderRepository {
  async create(orderData, items, transaction) {
    const order = await Order.create(orderData, { transaction });
    const orderItems = items.map((item) => ({
      ...item,
      orderId: order.id,
    }));

    await OrderItem.bulkCreate(orderItems, { transaction });
    return order;
  }

  async findById(id) {
    return Order.findByPk(id, { include: orderIncludes });
  }

  async findAll({ where, page = 1, limit = 10 }) {
    const pagination = getPagination({ page, limit });
    const { count, rows } = await Order.findAndCountAll({
      where,
      include: orderIncludes,
      distinct: true,
      limit: pagination.limit,
      offset: pagination.offset,
      order: [['createdAt', 'DESC']],
    });

    return {
      orders: rows,
      ...buildPaginationMeta({ count, page: pagination.page, limit: pagination.limit }),
    };
  }

  async updateStatus(id, status, transaction = null) {
    const order = await Order.findByPk(id, { transaction });
    if (!order) return null;

    await order.update({ status }, { transaction });
    return this.findById(id);
  }
}

module.exports = new OrderRepository();
