const AppError = require('../utils/AppError');
const { SellerRequest, User } = require('../models');

class SellerService {
  async requestSellerProfile(requester, cpf) {
    void requester;
    void cpf;
    throw new AppError('Use o formulário completo de solicitação de vendedor', 410);
  }

  async approveSeller(userId, requester) {
    void userId;
    void requester;
    throw new AppError('Use o painel de solicitações e aprovações internas', 410);
  }

  async blockSeller(userId, requester) {
    void userId;
    void requester;
    throw new AppError('Use o painel de solicitações e aprovações internas', 410);
  }

  async rejectSeller(userId, requester) {
    void userId;
    void requester;
    throw new AppError('Use o painel de solicitações e aprovações internas', 410);
  }

  async listRequests(requester) {
    if (!['admin', 'environment_admin'].includes(requester.role)) {
      throw new AppError('Apenas admins podem visualizar solicitações', 403);
    }
    return SellerRequest.findAll({
      where: { environmentId: requester.environmentId },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone', 'cpfVerifiedAt', 'profileImageUrl'] }],
      order: [['requestedAt', 'DESC']],
    });
  }
}

module.exports = new SellerService();
