const UserRepository = require('../repositories/UserRepository');
const UserEnvironmentRepository = require('../repositories/UserEnvironmentRepository');
const AppError = require('../utils/AppError');
const { isValidCpf, onlyDigits } = require('../utils/security');

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
      return user;
    }

    const normalizedCpf = onlyDigits(cpf);
    if (!isValidCpf(normalizedCpf)) {
      throw new AppError('CPF inválido', 400);
    }

    const cpfInUse = await UserRepository.findByCpf(normalizedCpf);
    if (cpfInUse && Number(cpfInUse.id) !== Number(requester.id)) {
      throw new AppError('Este CPF já está vinculado a outro usuário', 409);
    }

    await UserEnvironmentRepository.upsert(requester.id, requester.environmentId, 'seller');

    return UserRepository.update(requester.id, {
      role: 'seller',
      cpf: normalizedCpf,
      cpfVerifiedAt: new Date(),
    });
  }

  async approveSeller(userId, requester) {
    if (requester.role !== 'admin') {
      throw new AppError('Apenas admins podem aprovar vendedores', 403);
    }

    const user = await UserRepository.findById(userId);
    if (!user || Number(user.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Usuário não encontrado neste ambiente', 404);
    }

    if (!user.emailVerifiedAt && !user.phoneVerifiedAt) {
      throw new AppError('Usuário precisa confirmar a conta antes de virar vendedor', 400);
    }

    if (!user.cpfVerifiedAt) {
      throw new AppError('Usuário precisa confirmar CPF antes de virar vendedor', 400);
    }

    await UserEnvironmentRepository.upsert(userId, requester.environmentId, 'seller');

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
    if (!user || Number(user.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Usuário não encontrado neste ambiente', 404);
    }

    await UserEnvironmentRepository.upsert(userId, requester.environmentId, 'customer');

    const rolePatch = Number(user.environmentId) === Number(requester.environmentId)
      ? { role: 'customer' }
      : {};

    return UserRepository.update(userId, rolePatch);
  }
}

module.exports = new SellerService();
