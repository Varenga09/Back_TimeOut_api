const SellerService = require('../services/SellerService');
const { successResponse } = require('../utils/response');

class SellerController {
  async requestProfile(req, res, next) {
    try {
      const user = await SellerService.requestSellerProfile(req.user, req.body.cpf);
      return successResponse(res, { user }, 'Perfil de vendedor ativado com sucesso');
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
}

module.exports = new SellerController();
