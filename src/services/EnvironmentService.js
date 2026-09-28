const EnvironmentRepository = require('../repositories/EnvironmentRepository');
const UserEnvironmentRepository = require('../repositories/UserEnvironmentRepository');
const UserRepository = require('../repositories/UserRepository');
const AppError = require('../utils/AppError');
const { isEnvironmentAdmin, isPlatformAdmin } = require('../utils/permissions');
const NotificationService = require('./InternalNotificationService');
const AuditService = require('./AuditService');
const { generateEnvironmentAccessCode, hashEnvironmentAccessCode } = require('../utils/security');
const { EnvironmentAccessCode } = require('../models');

class EnvironmentService {
  async create(data, requester = null) {
    if (requester && !isPlatformAdmin(requester)) {
      throw new AppError('Ambientes são criados somente após aprovação da equipe TimeOut', 403);
    }
    const accessCode = generateEnvironmentAccessCode();
    const existing = await EnvironmentRepository.findByAccessCode(accessCode);
    if (existing) {
      throw new AppError('Este código de acesso já está em uso', 409);
    }

    const environment = await EnvironmentRepository.create({
      ...data,
      accessCode,
    });
    await EnvironmentAccessCode.create({
      environmentId: environment.id,
      codeHash: hashEnvironmentAccessCode(accessCode),
      codePreview: `****${accessCode.slice(-4)}`,
      isActive: true,
      createdBy: requester?.id || null,
    });

    if (!requester) {
      return { environment };
    }

    await UserEnvironmentRepository.upsert(requester.id, environment.id, 'environment_admin');
    const user = await UserRepository.update(requester.id, {
      environmentId: environment.id,
      role: 'environment_admin',
    });

    return { environment, user };
  }

  async getAll(query, requester) {
    if (isEnvironmentAdmin(requester)) {
      const environment = await EnvironmentRepository.findById(requester.environmentId);
      return { environments: environment ? [environment] : [], total: environment ? 1 : 0, page: 1, limit: 1, totalPages: 1 };
    }
    if (!isPlatformAdmin(requester)) throw new AppError('Acesso restrito à equipe TimeOut', 403);
    return EnvironmentRepository.findAll(query);
  }

  async getById(id, requester) {
    const environment = await EnvironmentRepository.findById(id);
    if (!environment) {
      throw new AppError('Ambiente não encontrado', 404);
    }

    if (!isPlatformAdmin(requester) && Number(requester.environmentId) !== Number(id)) {
      throw new AppError('Você não tem acesso a este ambiente', 403);
    }

    return environment;
  }

  async join(accessCode, requester) {
    const environment = await EnvironmentRepository.findByAccessCode(accessCode);
    if (!environment) {
      throw new AppError('Código de ambiente inválido', 404);
    }
    if (!environment.accessCodeEnabled || environment.status !== 'active') {
      throw new AppError('Este código de ambiente está temporariamente indisponível', 403);
    }

    let membership = await UserEnvironmentRepository.findOne(requester.id, environment.id);
    if (!membership) {
      membership = await require('../models').UserEnvironment.create({
        userId: requester.id,
        environmentId: environment.id,
        role: 'customer',
        status: environment.isPrivate ? 'pending' : 'approved',
      });
    }
    if (membership.status !== 'approved') {
      await NotificationService.notifyEnvironmentAdmins(environment.id, 'Nova solicitação de entrada', 'Um cliente aguarda aprovação para entrar no ambiente.', 'membership_review', '/admin-access');
      await AuditService.record({ actorId: requester.id, action: 'membership.requested', resourceType: 'membership', resourceId: membership.id, environmentId: environment.id, summary: 'Entrada no ambiente solicitada' });
      return { user: await UserRepository.findById(requester.id), membership, pendingApproval: true };
    }
    const user = await UserRepository.update(requester.id, { environmentId: environment.id, role: membership.role });
    return { user, membership, pendingApproval: false };
  }

  async switch(environmentId, requester) {
    const membership = await UserEnvironmentRepository.findOne(requester.id, environmentId);
    if (!membership || membership.status !== 'approved') {
      throw new AppError('Você ainda não faz parte deste ambiente', 403);
    }

    return UserRepository.update(requester.id, {
      environmentId: membership.environmentId,
      role: membership.role,
    });
  }

  async listUsers(environmentId, requester, query) {
    if (!isEnvironmentAdmin(requester) || Number(requester.environmentId) !== Number(environmentId)) {
      throw new AppError('Apenas o admin do ambiente pode listar usuários', 403);
    }

    return EnvironmentRepository.listUsers(environmentId, query);
  }
}

module.exports = new EnvironmentService();
