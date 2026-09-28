const SellerService = require('../services/SellerService');
const { successResponse } = require('../utils/response');

class SellerController {
  async requestProfile(req, res, next) {
    try {
      const result = await SellerService.requestSellerProfile(req.user, req.body.cpf);
      return successResponse(res, result, result.alreadySeller ? 'Perfil de vendedor já está ativo' : 'Solicitação enviada para aprovação');
    } catch (error) {
      return next(error);
    }
  }

  async approve(req, res, next) {
    try {
      const user = await SellerService.approveSeller(req.params.id, req.user);
      return successResponse(res, { user }, 'Vendedor aprovado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async block(req, res, next) {
    try {
      const user = await SellerService.blockSeller(req.params.id, req.user);
      return successResponse(res, { user }, 'Vendedor bloqueado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async reject(req, res, next) {
    try {
      const request = await SellerService.rejectSeller(req.params.id, req.user);
      return successResponse(res, { request }, 'Solicitação rejeitada');
    } catch (error) {
      return next(error);
    }
  }

  async listRequests(req, res, next) {
    try {
      const requests = await SellerService.listRequests(req.user);
      return successResponse(res, { requests }, 'Solicitações de vendedor listadas');
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new SellerController();
