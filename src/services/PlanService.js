const { SellerRequest, User, Environment } = require('../models');
const PlanRepository = require('../repositories/PlanRepository');
const UserEnvironmentRepository = require('../repositories/UserEnvironmentRepository');
const AppError = require('../utils/AppError');
const { isEnvironmentAdmin } = require('../utils/permissions');
const AuditService = require('./AuditService');

function summarize(orders) {
  return orders.reduce((totals, order) => ({
    grossRevenue: Number((totals.grossRevenue + Number(order.grossSalesAmount || 0)).toFixed(2)),
    commissions: Number((totals.commissions + Number(order.commissionAmount || 0)).toFixed(2)),
    netRevenue: Number((totals.netRevenue + Number(order.sellerNetRevenue || 0)).toFixed(2)),
    deliveredOrders: totals.deliveredOrders + 1,
  }), { grossRevenue: 0, commissions: 0, netRevenue: 0, deliveredOrders: 0 });
}

class PlanService {
  listPlans() {
    return PlanRepository.listPlans();
  }

  async ensureBasicSubscription(userId, environmentId, transaction = null) {
    const existing = await PlanRepository.findActiveSubscription(userId, environmentId);
    if (existing) return existing;
    const plan = await PlanRepository.findPlanByCode('basic');
    if (!plan) throw new AppError('Plano Básico não encontrado', 500);
    await PlanRepository.replaceSubscription(userId, environmentId, plan, transaction);
    return PlanRepository.findActiveSubscription(userId, environmentId);
  }

  async getSellerOverview(requester) {
    if (requester.role !== 'seller') {
      throw new AppError('Apenas vendedores podem acessar dados financeiros', 403);
    }
    const subscription = await this.ensureBasicSubscription(requester.id, requester.environmentId);
    const orders = await PlanRepository.listDeliveredOrders({ sellerId: requester.id, environmentId: requester.environmentId });
    const transactions = await PlanRepository.listMockTransactions({ sellerId: requester.id, environmentId: requester.environmentId });
    return { subscription, summary: summarize(orders), transactions, paymentMode: 'mock' };
  }

  async changeMyPlan(planCode, requester) {
    if (requester.role !== 'seller') {
      throw new AppError('Apenas vendedores podem testar planos', 403);
    }
    if (!['basic', 'pro'].includes(planCode)) {
      throw new AppError('Este plano não está disponível para troca pelo vendedor', 400);
    }
    return this.changeSubscription(requester.id, requester.environmentId, planCode);
  }

  async changeSubscription(userId, environmentId, planCode, transaction = null) {
    const plan = await PlanRepository.findPlanByCode(planCode);
    if (!plan) throw new AppError('Plano não encontrado', 404);
    await PlanRepository.replaceSubscription(userId, environmentId, plan, transaction);
    return PlanRepository.findActiveSubscription(userId, environmentId);
  }

  async getAdminOverview(requester) {
    this.ensureAdmin(requester);
    const sellerIds = await UserEnvironmentRepository.listSellerIds(requester.environmentId);
    await Promise.all(sellerIds.map((sellerId) => this.ensureBasicSubscription(sellerId, requester.environmentId)));
    const [subscriptions, requests, orders, environment] = await Promise.all([
      PlanRepository.listSubscriptions(requester.environmentId),
      SellerRequest.findAll({
        where: { environmentId: requester.environmentId },
        include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone', 'profileImageUrl'] }],
        order: [['requestedAt', 'DESC']],
      }),
      PlanRepository.listDeliveredOrders({ environmentId: requester.environmentId }),
      Environment.findByPk(requester.environmentId, {
        attributes: ['id', 'name', 'institutionalPlanConfig'],
      }),
    ]);
    return { subscriptions, requests, summary: summarize(orders), environment, paymentMode: 'mock' };
  }

  async adminChangePlan(userId, planCode, requester) {
    this.ensureAdmin(requester);
    const membership = await UserEnvironmentRepository.findOne(userId, requester.environmentId);
    if (!membership || membership.role !== 'seller') {
      throw new AppError('Vendedor não encontrado neste ambiente', 404);
    }
    return this.changeSubscription(userId, requester.environmentId, planCode);
  }

  cancelSubscription(userId, environmentId, transaction = null) {
    return PlanRepository.cancelActiveSubscription(userId, environmentId, transaction);
  }

  async updateInstitutionalConfig(config, requester) {
    this.ensureAdmin(requester);
    const environment = await Environment.findByPk(requester.environmentId);
    if (!environment) throw new AppError('Ambiente não encontrado', 404);
    await environment.update({ institutionalPlanConfig: config });
    await AuditService.record({
      actorId: requester.id,
      action: 'environment.institutional_data_updated',
      resourceType: 'environment',
      resourceId: environment.id,
      environmentId: environment.id,
      summary: 'Dados institucionais e plano do ambiente atualizados',
    });
    return environment;
  }

  ensureAdmin(requester) {
    if (!isEnvironmentAdmin(requester)) {
      throw new AppError('Apenas administradores podem acessar estes dados', 403);
    }
  }
}

module.exports = new PlanService();
