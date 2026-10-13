const service = require('../services/AccountAdministrationService');
const { successResponse } = require('../utils/response');

class AccountAdministrationController {
  async list(req, res, next) {
    try { return successResponse(res, await service.list(req.user, req.query), 'Contas encontradas'); }
    catch (error) { return next(error); }
  }
  async detail(req, res, next) {
    try { return successResponse(res, await service.detail(req.params.id, req.user), 'Conta encontrada'); }
    catch (error) { return next(error); }
  }
  async profile(req, res, next) {
    try { return successResponse(res, await service.updateProfile(req.params.id, req.body, req.user), 'Dados corrigidos'); }
    catch (error) { return next(error); }
  }
  async status(req, res, next) {
    try { return successResponse(res, await service.setSuspended(req.params.id, req.body.suspended, req.body.reason, req.user), 'Situação da conta atualizada'); }
    catch (error) { return next(error); }
  }
  async sessions(req, res, next) {
    try { return successResponse(res, await service.invalidateSessions(req.params.id, req.body.reason, req.user), 'Sessões invalidadas'); }
    catch (error) { return next(error); }
  }
  async email(req, res, next) {
    try { return successResponse(res, await service.requestEmailReverification(req.params.id, req.body.reason, req.user), 'Nova confirmação solicitada'); }
    catch (error) { return next(error); }
  }
}

module.exports = new AccountAdministrationController();
