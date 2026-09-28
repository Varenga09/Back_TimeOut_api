const { Op } = require('sequelize');
const { Plan, Subscription, User, MockTransaction, Order } = require('../models');

class PlanRepository {
  listPlans() {
    return Plan.findAll({ where: { isActive: true }, order: [['monthlyPrice', 'ASC']] });
  }

  findPlanByCode(code) {
    return Plan.findOne({ where: { code, isActive: true } });
  }

  findActiveSubscription(userId, environmentId) {
    return Subscription.findOne({
      where: { userId, environmentId, status: 'active' },
      include: [{ model: Plan, as: 'plan' }],
      order: [['startedAt', 'DESC']],
    });
  }

  async replaceSubscription(userId, environmentId, plan, transaction = null) {
    const now = new Date();
    await Subscription.update(
      { status: 'canceled', endedAt: now },
      { where: { userId, environmentId, status: 'active' }, transaction }
    );
    return Subscription.create({
      userId,
      environmentId,
      planId: plan.id,
      monthlyPrice: plan.monthlyPrice,
      commissionRate: plan.commissionRate,
      startedAt: now,
      status: 'active',
      isSimulated: true,
    }, { transaction });
  }

  cancelActiveSubscription(userId, environmentId, transaction = null) {
    return Subscription.update(
      { status: 'canceled', endedAt: new Date() },
      { where: { userId, environmentId, status: 'active' }, transaction }
    );
  }

  listSubscriptions(environmentId) {
    return Subscription.findAll({
      where: { environmentId, status: 'active' },
      include: [
        { model: Plan, as: 'plan' },
        { model: User, as: 'seller', attributes: ['id', 'name', 'email', 'phone', 'profileImageUrl'] },
      ],
      order: [['startedAt', 'DESC']],
    });
  }

  listMockTransactions({ sellerId, environmentId, limit = 30 }) {
    return MockTransaction.findAll({
      where: { sellerId, environmentId },
      include: [{ model: Order, as: 'order', attributes: ['id', 'status', 'createdAt'] }],
      order: [['createdAt', 'DESC']],
      limit,
    });
  }

  listDeliveredOrders({ sellerId, environmentId }) {
    return Order.findAll({
      where: {
        environmentId,
        status: 'delivered',
        commissionConfirmedAt: { [Op.ne]: null },
        ...(sellerId && { sellerId }),
      },
      attributes: ['id', 'sellerId', 'grossSalesAmount', 'commissionAmount', 'sellerNetRevenue', 'commissionConfirmedAt', 'createdAt'],
    });
  }
}

module.exports = new PlanRepository();
