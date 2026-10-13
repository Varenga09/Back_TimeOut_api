const { Op } = require('sequelize');
const { sequelize, User, UserEnvironment, Environment, AuditLog } = require('../models');
const AppError = require('../utils/AppError');
const { isEnvironmentAdmin, isPlatformAdmin } = require('../utils/permissions');
const AuditService = require('./AuditService');
const NotificationService = require('./InternalNotificationService');

const publicAttributes = ['id', 'name', 'email', 'phone', 'role', 'environmentId', 'emailVerifiedAt', 'createdAt', 'updatedAt', 'isSuspended'];

class AccountAdministrationService {
  async getTarget(id, requester, transaction = null) {
    if (!isPlatformAdmin(requester) && !isEnvironmentAdmin(requester)) throw new AppError('Acesso administrativo necessário', 403);
    const user = await User.findByPk(id, { transaction });
    if (!user) throw new AppError('Conta não encontrada', 404);
    if (!isPlatformAdmin(requester)) {
      if (user.role === 'platform_admin') throw new AppError('Acesso não autorizado', 403);
      if (['admin', 'environment_admin'].includes(user.role)) throw new AppError('Somente a equipe Time Out pode gerenciar administradores', 403);
      const membership = await UserEnvironment.findOne({ where: { userId: id, environmentId: requester.environmentId }, transaction });
      if (!membership) throw new AppError('Conta não encontrada neste ambiente', 404);
      if (['admin', 'environment_admin'].includes(membership.role)) throw new AppError('Somente a equipe Time Out pode gerenciar administradores', 403);
    }
    return user;
  }

  async list(requester, { page = 1, limit = 20, search = '', role = '' } = {}) {
    if (!isPlatformAdmin(requester) && !isEnvironmentAdmin(requester)) throw new AppError('Acesso administrativo necessário', 403);
    if (!isPlatformAdmin(requester) && role && !['customer', 'seller'].includes(role)) throw new AppError('Acesso não autorizado', 403);
    const safePage = Math.max(1, Number(page));
    const safeLimit = Math.min(50, Math.max(1, Number(limit)));
    const where = search ? { [Op.or]: [{ name: { [Op.like]: `%${search}%` } }, { email: { [Op.like]: `%${search}%` } }] } : {};
    if (role) where.role = role;
    if (!isPlatformAdmin(requester)) where.role = role || { [Op.in]: ['customer', 'seller'] };
    const membership = isPlatformAdmin(requester) ? undefined : [{ model: UserEnvironment, as: 'memberships', where: { environmentId: requester.environmentId }, attributes: ['id', 'environmentId', 'role', 'status'] }];
    const { rows, count } = await User.findAndCountAll({
      where,
      attributes: publicAttributes,
      include: membership,
      distinct: true,
      order: [['createdAt', 'DESC']],
      limit: safeLimit,
      offset: (safePage - 1) * safeLimit,
    });
    return { users: rows, total: count, page: safePage, limit: safeLimit, totalPages: Math.ceil(count / safeLimit) };
  }

  async detail(id, requester) {
    const user = await this.getTarget(id, requester);
    const [memberships, history] = await Promise.all([UserEnvironment.findAll({
      where: { userId: id, ...(!isPlatformAdmin(requester) && { environmentId: requester.environmentId }) },
      attributes: ['id', 'environmentId', 'role', 'status', 'reviewedAt', 'reviewedBy', 'createdAt'],
      include: [{ model: Environment, as: 'environment', attributes: ['id', 'name', 'status'] }],
    }), AuditLog.findAll({
      where: { resourceType: 'user', resourceId: String(id), ...(!isPlatformAdmin(requester) && { environmentId: requester.environmentId }) },
      attributes: ['id', 'actorId', 'action', 'summary', 'metadata', 'createdAt'],
      order: [['createdAt', 'DESC']],
      limit: 50,
    })]);
    return { user: Object.fromEntries(publicAttributes.map((key) => [key, user[key]])), memberships, history };
  }

  async updateProfile(id, { name, phone }, requester) {
    if (!name && phone === undefined) throw new AppError('Informe nome ou telefone', 400);
    await sequelize.transaction(async (transaction) => {
      const user = await this.getTarget(id, requester, transaction);
      if (Number(user.id) === Number(requester.id)) throw new AppError('Use seu perfil para alterar seus próprios dados', 403);
      await user.update({ ...(name && { name }), ...(phone !== undefined && { phone }) }, { transaction });
      await AuditService.record({ actorId: requester.id, action: 'account.profile_corrected', resourceType: 'user', resourceId: id, environmentId: isPlatformAdmin(requester) ? null : requester.environmentId, summary: 'Nome ou telefone da conta corrigido', metadata: { fields: [name && 'name', phone !== undefined && 'phone'].filter(Boolean) } }, transaction);
      await NotificationService.create(id, 'Dados atualizados', 'Seu nome ou telefone foi corrigido por um administrador.', 'account', '/profile', transaction);
    });
    return this.detail(id, requester);
  }

  async setSuspended(id, suspended, reason, requester) {
    if (suspended && !reason?.trim()) throw new AppError('Informe a justificativa para suspender a conta', 400);
    await sequelize.transaction(async (transaction) => {
      const user = await this.getTarget(id, requester, transaction);
      if (Number(user.id) === Number(requester.id)) throw new AppError('Você não pode suspender sua própria conta', 403);
      if (user.role === 'platform_admin') {
        if (!isPlatformAdmin(requester)) throw new AppError('Acesso não autorizado', 403);
        const activeAdmins = (await User.findAll({ where: { role: 'platform_admin', isSuspended: false }, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE })).length;
        if (suspended && activeAdmins <= 1) throw new AppError('O último administrador interno não pode ser suspenso', 409);
      }
      if (user.isSuspended === suspended) return;
      await user.update({ isSuspended: suspended, tokenVersion: Number(user.tokenVersion || 0) + 1 }, { transaction });
      await AuditService.record({ actorId: requester.id, action: suspended ? 'account.suspended' : 'account.reactivated', resourceType: 'user', resourceId: id, environmentId: isPlatformAdmin(requester) ? null : requester.environmentId, summary: suspended ? 'Conta suspensa' : 'Conta reativada', metadata: { reason: reason?.trim() || null } }, transaction);
      await NotificationService.create(id, suspended ? 'Conta suspensa' : 'Conta reativada', suspended ? `Sua conta foi suspensa: ${reason}` : 'Sua conta foi reativada.', 'account', '/access', transaction);
    });
    return this.detail(id, requester);
  }

  async invalidateSessions(id, reason, requester) {
    if (!reason?.trim()) throw new AppError('Informe a justificativa para encerrar as sessões', 400);
    await sequelize.transaction(async (transaction) => {
      const user = await this.getTarget(id, requester, transaction);
      await user.update({ tokenVersion: Number(user.tokenVersion || 0) + 1 }, { transaction });
      await AuditService.record({ actorId: requester.id, action: 'account.sessions_invalidated', resourceType: 'user', resourceId: id, environmentId: isPlatformAdmin(requester) ? null : requester.environmentId, summary: 'Sessões da conta invalidadas', metadata: { reason: reason.trim() } }, transaction);
      await NotificationService.create(id, 'Sessões encerradas', 'Entre novamente para continuar usando sua conta.', 'account', '/access', transaction);
    });
    return { invalidated: true };
  }

  async requestEmailReverification(id, reason, requester) {
    if (!reason?.trim()) throw new AppError('Informe a justificativa para solicitar nova confirmação', 400);
    await sequelize.transaction(async (transaction) => {
      const user = await this.getTarget(id, requester, transaction);
      if (Number(user.id) === Number(requester.id)) throw new AppError('Não é possível solicitar sua própria reconfirmação por este painel', 403);
      if (user.role === 'platform_admin') {
        const activeAdmins = (await User.findAll({ where: { role: 'platform_admin', isSuspended: false, emailVerifiedAt: { [Op.ne]: null } }, attributes: ['id'], transaction, lock: transaction.LOCK.UPDATE })).length;
        if (activeAdmins <= 1) throw new AppError('O último administrador interno confirmado não pode perder a confirmação por este painel', 409);
      }
      await user.update({ emailVerifiedAt: null, emailVerificationCode: null, emailVerificationExpiresAt: null, tokenVersion: Number(user.tokenVersion || 0) + 1 }, { transaction });
      await AuditService.record({ actorId: requester.id, action: 'account.email_reverification_requested', resourceType: 'user', resourceId: id, environmentId: isPlatformAdmin(requester) ? null : requester.environmentId, summary: 'Nova confirmação de e-mail solicitada', metadata: { reason: reason.trim() } }, transaction);
      await NotificationService.create(id, 'Confirme seu e-mail novamente', 'Solicite um novo código na tela de confirmação após entrar novamente.', 'account', '/access', transaction);
    });
    return { requested: true };
  }
}

module.exports = new AccountAdministrationService();
