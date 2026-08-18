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
}

module.exports = new PaymentController();
