const PaymentService = require('../services/PaymentService');
const { successResponse } = require('../utils/response');

class PaymentController {
  async getMySettings(req, res, next) {
    try {
      const settings = await PaymentService.getMySettings(req.user);
      return successResponse(res, { settings }, 'Configurações de pagamento encontradas');
    } catch (error) {
      return next(error);
    }
  }

  async getSellerSettings(req, res, next) {
    try {
      const settings = await PaymentService.getSellerSettings(req.params.sellerId, req.user);
      return successResponse(res, { settings }, 'Formas de pagamento do vendedor encontradas');
    } catch (error) {
      return next(error);
    }
  }

  async updateMySettings(req, res, next) {
    try {
      const settings = await PaymentService.updateMySettings(req.body, req.user);
      return successResponse(res, { settings }, 'Configurações de pagamento atualizadas');
    } catch (error) {
      return next(error);
    }
  }

  async retryPayment(req, res, next) {
    try {
      const payment = await PaymentService.retryPayment(req.params.id, req.user);
      return successResponse(res, { payment }, 'Pagamento gerado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async mercadoPagoWebhook(req, res, next) {
    try {
      const result = await PaymentService.handleMercadoPagoWebhook(req.body, req.query, req.headers);
      return successResponse(res, result, 'Webhook recebido');
    } catch (error) {
      return next(error);
    }
  }

  async simulate(req, res, next) {
    try {
      const result = await PaymentService.simulatePayment(req.params.id, req.body.status, req.user);
      return successResponse(res, result, 'Pagamento simulado atualizado');
    } catch (error) {
      return next(error);
    }
  }

  async payoutOverview(req, res, next) {
    try { return successResponse(res, await PaymentService.getPayoutOverview(req.user, req.query), 'Recebimentos encontrados'); }
    catch (error) { return next(error); }
  }

  async connectPayout(req, res, next) {
    try { return successResponse(res, { account: await PaymentService.connectPayoutAccount(req.body, req.user) }, 'Conta de teste conectada', 201); }
    catch (error) { return next(error); }
  }

  async adminOverview(req, res, next) {
    try { return successResponse(res, await PaymentService.getAdminPayoutOverview(req.user, req.query), 'Visão financeira encontrada'); }
    catch (error) { return next(error); }
  }

  async payoutStatus(req, res, next) {
    try { return successResponse(res, { account: await PaymentService.setPayoutAccountStatus(req.params.sellerId, req.body.suspended, req.user) }, 'Conta de recebimento atualizada'); }
    catch (error) { return next(error); }
  }

  async platformOverview(req, res, next) {
    try { return successResponse(res, await PaymentService.getPlatformPayoutOverview(req.user, req.query), 'Visão geral financeira encontrada'); }
    catch (error) { return next(error); }
  }

  async retrySettlement(req, res, next) {
    try { return successResponse(res, await PaymentService.retrySettlement(req.params.id, req.user), 'Nova tentativa de liquidação concluída'); }
    catch (error) { return next(error); }
  }
}

module.exports = new PaymentController();
