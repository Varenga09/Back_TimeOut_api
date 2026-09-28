const PlanService = require('../services/PlanService');
const { successResponse } = require('../utils/response');

class PlanController {
  async list(req, res, next) {
    try { return successResponse(res, { plans: await PlanService.listPlans() }, 'Planos experimentais listados'); }
    catch (error) { return next(error); }
  }
  async myOverview(req, res, next) {
    try { return successResponse(res, await PlanService.getSellerOverview(req.user), 'Resumo financeiro encontrado'); }
    catch (error) { return next(error); }
  }
  async changeMine(req, res, next) {
    try { return successResponse(res, { subscription: await PlanService.changeMyPlan(req.body.planCode, req.user) }, 'Plano de teste alterado'); }
    catch (error) { return next(error); }
  }
  async adminOverview(req, res, next) {
    try { return successResponse(res, await PlanService.getAdminOverview(req.user), 'Visão financeira do ambiente encontrada'); }
    catch (error) { return next(error); }
  }
  async adminChange(req, res, next) {
    try { return successResponse(res, { subscription: await PlanService.adminChangePlan(req.params.id, req.body.planCode, req.user) }, 'Plano do vendedor alterado'); }
    catch (error) { return next(error); }
  }
  async institutional(req, res, next) {
    try { return successResponse(res, { environment: await PlanService.updateInstitutionalConfig(req.body, req.user) }, 'Configuração institucional atualizada'); }
    catch (error) { return next(error); }
  }
}

module.exports = new PlanController();
