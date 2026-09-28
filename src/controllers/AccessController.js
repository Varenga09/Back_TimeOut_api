const AccessControlService = require('../services/AccessControlService');
const { successResponse } = require('../utils/response');

class AccessController {
  async sellerApply(req, res, next) {
    try {
      const productCategories = Array.isArray(req.body.productCategories)
        ? req.body.productCategories
        : String(req.body.productCategories || '').split(',').map((item) => item.trim()).filter(Boolean);
      const application = await AccessControlService.createSellerApplication({ ...req.body, productCategories }, req.user);
      return successResponse(res, { application }, 'Solicitação de vendedor enviada', 201);
    } catch (error) { return next(error); }
  }
  async environmentApply(req, res, next) {
    try {
      const application = await AccessControlService.createEnvironmentApplication(req.body, req.user, req.file);
      return successResponse(res, { application }, 'Solicitação de ambiente enviada', 201);
    } catch (error) { return next(error); }
  }
  async mine(req, res, next) {
    try { return successResponse(res, await AccessControlService.getMyApplications(req.user), 'Solicitações encontradas'); }
    catch (error) { return next(error); }
  }
  async notifications(req, res, next) {
    try { return successResponse(res, await AccessControlService.listNotifications(req.user), 'Notificações encontradas'); }
    catch (error) { return next(error); }
  }
  async readNotification(req, res, next) {
    try { return successResponse(res, { notification: await AccessControlService.markNotificationRead(req.params.id, req.user) }, 'Notificação lida'); }
    catch (error) { return next(error); }
  }
  async environmentDashboard(req, res, next) {
    try { return successResponse(res, await AccessControlService.getEnvironmentDashboard(req.user), 'Painel de acessos carregado'); }
    catch (error) { return next(error); }
  }
  async reviewSeller(req, res, next) {
    try { return successResponse(res, { application: await AccessControlService.reviewSellerApplication(req.params.id, req.body, req.user) }, 'Solicitação atualizada'); }
    catch (error) { return next(error); }
  }
  async reviewMembership(req, res, next) {
    try { return successResponse(res, { membership: await AccessControlService.reviewMembership(req.params.id, req.body, req.user) }, 'Participação atualizada'); }
    catch (error) { return next(error); }
  }
  async rotateCode(req, res, next) {
    try { return successResponse(res, await AccessControlService.rotateAccessCode(req.user), 'Novo código gerado'); }
    catch (error) { return next(error); }
  }
  async codeEnabled(req, res, next) {
    try { return successResponse(res, await AccessControlService.setAccessCodeEnabled(req.body.enabled, req.user), 'Disponibilidade do código atualizada'); }
    catch (error) { return next(error); }
  }
  async platformDashboard(req, res, next) {
    try { return successResponse(res, await AccessControlService.getPlatformDashboard(req.user), 'Painel da equipe carregado'); }
    catch (error) { return next(error); }
  }
  async reviewEnvironment(req, res, next) {
    try { return successResponse(res, await AccessControlService.reviewEnvironmentApplication(req.params.id, req.body, req.user), 'Solicitação atualizada'); }
    catch (error) { return next(error); }
  }
  async suspendEnvironment(req, res, next) {
    try { return successResponse(res, { environment: await AccessControlService.suspendEnvironment(req.params.id, req.body.suspended, req.user) }, 'Ambiente atualizado'); }
    catch (error) { return next(error); }
  }
  async transferEnvironment(req, res, next) {
    try { return successResponse(res, await AccessControlService.transferEnvironment(req.params.id, req.body.userId, req.user), 'Administração transferida'); }
    catch (error) { return next(error); }
  }
  async suspendAdministrator(req, res, next) {
    try { return successResponse(res, await AccessControlService.suspendAdministrator(req.params.id, req.body.suspended, req.user), 'Administrador atualizado'); }
    catch (error) { return next(error); }
  }
  async environmentDocument(req, res, next) {
    try {
      const documentPath = await AccessControlService.getEnvironmentApplicationDocument(req.params.id, req.user);
      return res.sendFile(documentPath);
    } catch (error) { return next(error); }
  }
  async revealCpf(req, res, next) {
    try { return successResponse(res, await AccessControlService.revealCpf(req.params.type, req.params.id, req.user), 'CPF acessado para análise'); }
    catch (error) { return next(error); }
  }
}

module.exports = new AccessController();
