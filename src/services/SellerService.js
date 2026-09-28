const UserRepository = require('../repositories/UserRepository');
const UserEnvironmentRepository = require('../repositories/UserEnvironmentRepository');
const AppError = require('../utils/AppError');
const { isValidCpf, onlyDigits } = require('../utils/security');
const { SellerRequest, User } = require('../models');
const PlanService = require('./PlanService');

class SellerService {
  async requestSellerProfile(requester, cpf) {
    const user = await UserRepository.findById(requester.id);
    if (!user) {
      throw new AppError('Usuário não encontrado', 404);
    }

    if (!user.emailVerifiedAt && !user.phoneVerifiedAt) {
      throw new AppError('Confirme sua conta antes de ativar vendedor', 403);
    }

    if (user.role === 'seller' && user.cpfVerifiedAt) {
      return { user, request: null, alreadySeller: true };
    }

    const normalizedCpf = onlyDigits(cpf);
    if (!isValidCpf(normalizedCpf)) {
      throw new AppError('CPF inválido', 400);
    }

    const cpfInUse = await UserRepository.findByCpf(normalizedCpf);
    if (cpfInUse && Number(cpfInUse.id) !== Number(requester.id)) {
      throw new AppError('Este CPF já está vinculado a outro usuário', 409);
    }

    const updatedUser = await UserRepository.update(requester.id, {
      cpf: normalizedCpf,
      cpfVerifiedAt: new Date(),
    });
    const [request] = await SellerRequest.findOrCreate({
      where: { userId: requester.id, environmentId: requester.environmentId },
      defaults: { status: 'pending', requestedAt: new Date() },
    });
    if (request.status !== 'pending') {
      await request.update({ status: 'pending', requestedAt: new Date(), reviewedAt: null, reviewedBy: null });
    }

    return { user: updatedUser, request, alreadySeller: false };
  }

  async approveSeller(userId, requester) {
    if (requester.role !== 'admin') {
      throw new AppError('Apenas admins podem aprovar vendedores', 403);
    }

    const user = await UserRepository.findById(userId);
    const membership = user && await UserEnvironmentRepository.findOne(userId, requester.environmentId);
    if (!user || !membership) {
      throw new AppError('Usuário não encontrado neste ambiente', 404);
    }

    if (!user.emailVerifiedAt && !user.phoneVerifiedAt) {
      throw new AppError('Usuário precisa confirmar a conta antes de virar vendedor', 400);
    }

    if (!user.cpfVerifiedAt) {
      throw new AppError('Usuário precisa confirmar CPF antes de virar vendedor', 400);
    }

    const request = await SellerRequest.findOne({ where: { userId, environmentId: requester.environmentId } });
    if (!request || request.status !== 'pending') {
      throw new AppError('Não existe solicitação de vendedor pendente', 400);
    }

    await UserEnvironmentRepository.upsert(userId, requester.environmentId, 'seller');
    await request.update({ status: 'approved', reviewedAt: new Date(), reviewedBy: requester.id });
    await PlanService.ensureBasicSubscription(userId, requester.environmentId);

    const rolePatch = Number(user.environmentId) === Number(requester.environmentId)
      ? { role: 'seller' }
      : {};

    return UserRepository.update(userId, rolePatch);
  }

  async blockSeller(userId, requester) {
    if (requester.role !== 'admin') {
      throw new AppError('Apenas admins podem bloquear vendedores', 403);
    }

    const user = await UserRepository.findById(userId);
    const membership = user && await UserEnvironmentRepository.findOne(userId, requester.environmentId);
    if (!user || !membership) {
      throw new AppError('Usuário não encontrado neste ambiente', 404);
    }

    await UserEnvironmentRepository.upsert(userId, requester.environmentId, 'customer');
    await PlanService.cancelSubscription(userId, requester.environmentId);
    const [request] = await SellerRequest.findOrCreate({
      where: { userId, environmentId: requester.environmentId },
      defaults: { status: 'blocked', requestedAt: new Date(), reviewedAt: new Date(), reviewedBy: requester.id },
    });
    if (request.status !== 'blocked') {
      await request.update({ status: 'blocked', reviewedAt: new Date(), reviewedBy: requester.id });
    }

    const rolePatch = Number(user.environmentId) === Number(requester.environmentId)
      ? { role: 'customer' }
      : {};

    return UserRepository.update(userId, rolePatch);
  }

  async rejectSeller(userId, requester) {
    if (requester.role !== 'admin') {
      throw new AppError('Apenas admins podem rejeitar solicitações', 403);
    }

    const request = await SellerRequest.findOne({
      where: { userId, environmentId: requester.environmentId, status: 'pending' },
    });
    if (!request) {
      throw new AppError('Solicitação pendente não encontrada', 404);
    }

    await request.update({ status: 'rejected', reviewedAt: new Date(), reviewedBy: requester.id });
    return request;
  }

  async listRequests(requester) {
    if (requester.role !== 'admin') {
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
