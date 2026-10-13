const { Op } = require('sequelize');
const path = require('path');
const fs = require('fs');
const {
  sequelize,
  User,
  Environment,
  UserEnvironment,
  SellerRequest,
  EnvironmentApplication,
  Notification,
  AuditLog,
  EnvironmentAccessCode,
  Product,
  Order,
  SellerPayoutAccount,
} = require('../models');
const AppError = require('../utils/AppError');
const { isEnvironmentAdmin, isPlatformAdmin } = require('../utils/permissions');
const {
  generateEnvironmentAccessCode,
  hashEnvironmentAccessCode,
  isValidCpf,
  isValidBrazilPhone,
  maskCpf,
  onlyDigits,
} = require('../utils/security');
const PlanService = require('./PlanService');
const NotificationService = require('./InternalNotificationService');
const AuditService = require('./AuditService');

const activeApplicationStatuses = ['pending', 'under_review', 'changes_requested'];

function appendHistory(application, status, actorId, note = null) {
  return [
    ...(Array.isArray(application.history) ? application.history : []),
    { status, actorId, note, at: new Date().toISOString() },
  ];
}

function sanitizeApplication(application, revealCpf = false) {
  const values = application?.toJSON ? application.toJSON() : { ...application };
  if (values.cpf) values.cpf = revealCpf ? values.cpf : maskCpf(values.cpf);
  return values;
}

class AccessControlService {
  ensureIdentityMode() {
    return process.env.IDENTITY_VERIFICATION_MODE === 'live' ? 'live' : 'mock';
  }

  async createSellerApplication(data, requester, file = null) {
    if (!requester.environmentId) throw new AppError('Entre em um ambiente aprovado antes de solicitar vendas', 400);
    const membership = await UserEnvironment.findOne({ where: { userId: requester.id, environmentId: requester.environmentId, status: 'approved' } });
    if (!membership) throw new AppError('Você precisa pertencer ao ambiente para solicitar vendas', 403);
    if (!isValidCpf(data.cpf)) throw new AppError('CPF inválido quanto ao formato e dígitos verificadores', 400);
    if (!isValidBrazilPhone(data.phone)) throw new AppError('Telefone brasileiro inválido', 400);
    if (new Date(data.birthDate) >= new Date()) throw new AppError('Data de nascimento inválida', 400);
    if (!data.acceptedTerms) throw new AppError('É necessário aceitar os termos de vendedor', 400);

    const cpf = onlyDigits(data.cpf);
    const cpfOwner = await User.findOne({ where: { cpf, id: { [Op.ne]: requester.id } }, attributes: ['id'] });
    if (cpfOwner) throw new AppError('Este CPF já está vinculado a outra conta', 409);

    const existing = await SellerRequest.findOne({
      where: { userId: requester.id, environmentId: requester.environmentId, status: activeApplicationStatuses },
      order: [['createdAt', 'DESC']],
    });
    if (existing && existing.status !== 'changes_requested') {
      throw new AppError('Você já possui uma solicitação de vendedor em andamento', 409);
    }

    const payload = {
      fullName: data.fullName,
      birthDate: data.birthDate,
      phone: data.phone,
      storeName: data.storeName,
      activityDescription: data.activityDescription,
      productCategories: data.productCategories,
      reason: data.reason,
      acceptedTerms: true,
      status: 'pending',
      requestedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      decisionReason: null,
      correctionNotes: null,
      documentPath: file?.filename || existing?.documentPath || null,
    };

    const application = await sequelize.transaction(async (transaction) => {
      await User.update({ name: data.fullName, phone: data.phone, cpf, cpfVerifiedAt: new Date() }, { where: { id: requester.id }, transaction });
      const saved = existing
        ? await existing.update({ ...payload, history: appendHistory(existing, 'pending', requester.id, 'Correções enviadas') }, { transaction })
        : await SellerRequest.create({ ...payload, userId: requester.id, environmentId: requester.environmentId, history: [{ status: 'pending', actorId: requester.id, at: new Date().toISOString() }] }, { transaction });
      await NotificationService.create(requester.id, 'Solicitação enviada', 'Sua solicitação de vendedor foi enviada para análise.', 'seller_application', '/access', transaction, { resourceType: 'seller_application', resourceId: saved.id, environmentId: requester.environmentId });
      await NotificationService.notifyEnvironmentAdmins(requester.environmentId, 'Nova solicitação de vendedor', `${data.fullName} aguarda análise.`, 'seller_application_review', '/admin-access', transaction, { resourceType: 'seller_application', resourceId: saved.id });
      await AuditService.record({ actorId: requester.id, action: 'seller_application.created', resourceType: 'seller_application', resourceId: saved.id, environmentId: requester.environmentId, summary: 'Solicitação de vendedor criada' }, transaction);
      return saved;
    });
    return sanitizeApplication(application);
  }

  async reviewSellerApplication(id, data, requester) {
    if (!isEnvironmentAdmin(requester)) throw new AppError('Apenas administradores do ambiente podem revisar vendedores', 403);
    const application = await SellerRequest.findByPk(id);
    if (!application || Number(application.environmentId) !== Number(requester.environmentId)) throw new AppError('Solicitação não encontrada neste ambiente', 404);
    if (Number(application.userId) === Number(requester.id)) throw new AppError('Você não pode aprovar a própria solicitação', 403);
    const allowed = ['under_review', 'changes_requested', 'approved', 'rejected', 'suspended', 'revoked', 'blocked'];
    if (!allowed.includes(data.status)) throw new AppError('Decisão inválida', 400);
    if (application.status === 'approved' && ['changes_requested', 'rejected'].includes(data.status)) throw new AppError('Uma autorização aprovada deve ser suspensa ou revogada, não recusada retroativamente', 409);
    if (['changes_requested', 'rejected', 'suspended', 'revoked', 'blocked'].includes(data.status) && !data.reason?.trim()) throw new AppError('Informe a justificativa da decisão', 400);

    await sequelize.transaction(async (transaction) => {
      await application.update({
        status: data.status,
        reviewedBy: requester.id,
        reviewedAt: new Date(),
        decisionReason: ['rejected', 'suspended', 'revoked', 'blocked'].includes(data.status) ? data.reason : null,
        correctionNotes: data.status === 'changes_requested' ? data.reason : null,
        history: appendHistory(application, data.status, requester.id, data.reason),
      }, { transaction });

      if (data.status === 'approved') {
        await UserEnvironment.update({ role: 'seller', status: 'approved', reviewedAt: new Date(), reviewedBy: requester.id }, { where: { userId: application.userId, environmentId: application.environmentId }, transaction });
        const target = await User.findByPk(application.userId, { transaction });
        if (Number(target.environmentId) === Number(application.environmentId)) await target.update({ role: 'seller' }, { transaction });
      }
      if (['suspended', 'revoked', 'blocked'].includes(data.status)) {
        await UserEnvironment.update({ role: 'customer', status: 'approved', reviewedAt: new Date(), reviewedBy: requester.id }, { where: { userId: application.userId, environmentId: application.environmentId }, transaction });
        const target = await User.findByPk(application.userId, { transaction });
        if (Number(target.environmentId) === Number(application.environmentId)) await target.update({ role: 'customer', tokenVersion: Number(target.tokenVersion || 0) + 1 }, { transaction });
        await PlanService.cancelSubscription(application.userId, application.environmentId, transaction);
      }
      await NotificationService.create(application.userId, 'Solicitação de vendedor atualizada', this.sellerDecisionMessage(data.status, data.reason), 'seller_application', '/access', transaction, { resourceType: 'seller_application', resourceId: application.id, environmentId: application.environmentId });
      await AuditService.record({ actorId: requester.id, action: `seller_application.${data.status}`, resourceType: 'seller_application', resourceId: application.id, environmentId: application.environmentId, summary: `Solicitação de vendedor alterada para ${data.status}`, metadata: { reason: data.reason?.trim() || null } }, transaction);
    });
    if (data.status === 'approved') await PlanService.ensureBasicSubscription(application.userId, application.environmentId);
    return sanitizeApplication(await SellerRequest.findByPk(id));
  }

  sellerDecisionMessage(status, reason) {
    const messages = {
      under_review: 'Sua solicitação está em análise.',
      changes_requested: `O administrador solicitou correções: ${reason}`,
      approved: 'Sua solicitação de vendedor foi aprovada.',
      rejected: `Sua solicitação foi recusada: ${reason}`,
      suspended: `Sua autorização de vendedor foi suspensa: ${reason}`,
      revoked: `Sua autorização de vendedor foi removida: ${reason}`,
      blocked: `Sua autorização de vendedor foi marcada como irregular: ${reason}`,
    };
    return messages[status];
  }

  async createEnvironmentApplication(data, requester, file = null) {
    if (!isValidCpf(data.cpf)) throw new AppError('CPF inválido quanto ao formato e dígitos verificadores', 400);
    if (!isValidBrazilPhone(data.phone)) throw new AppError('Telefone brasileiro inválido', 400);
    const existing = await EnvironmentApplication.findOne({ where: { userId: requester.id, status: activeApplicationStatuses } });
    if (existing && existing.status !== 'changes_requested') throw new AppError('Você já possui uma solicitação de ambiente em andamento', 409);
    const payload = {
      responsibleName: data.responsibleName,
      cpf: onlyDigits(data.cpf),
      phone: data.phone,
      institutionName: data.institutionName,
      institutionType: data.institutionType,
      cnpj: data.cnpj ? onlyDigits(data.cnpj) : null,
      address: data.address,
      relationship: data.relationship,
      justification: data.justification,
      environmentDescription: data.environmentDescription,
      documentPath: file ? file.filename : existing?.documentPath || null,
      status: 'pending',
      reviewedBy: null,
      decisionReason: null,
      correctionNotes: null,
      decidedAt: null,
    };
    const application = existing
      ? await existing.update({ ...payload, history: appendHistory(existing, 'pending', requester.id, 'Correções enviadas') })
      : await EnvironmentApplication.create({ ...payload, userId: requester.id, history: [{ status: 'pending', actorId: requester.id, at: new Date().toISOString() }] });
    await NotificationService.create(requester.id, 'Solicitação de ambiente enviada', 'A equipe Time Out analisará sua solicitação.', 'environment_application', '/access', null, { resourceType: 'environment_application', resourceId: application.id });
    await NotificationService.notifyPlatformAdmins('Nova solicitação de ambiente', `${data.institutionName} aguarda análise.`, 'environment_application_review', '/platform', null, { resourceType: 'environment_application', resourceId: application.id });
    await AuditService.record({ actorId: requester.id, action: 'environment_application.created', resourceType: 'environment_application', resourceId: application.id, summary: 'Solicitação de ambiente criada' });
    return sanitizeApplication(application);
  }

  async reviewEnvironmentApplication(id, data, requester) {
    if (!isPlatformAdmin(requester)) throw new AppError('Apenas a equipe interna Time Out pode revisar ambientes', 403);
    const application = await EnvironmentApplication.findByPk(id);
    if (!application) throw new AppError('Solicitação de ambiente não encontrada', 404);
    if (application.status === 'approved') throw new AppError('Esta solicitação já foi aprovada', 409);
    if (application.status === 'rejected') throw new AppError('Uma solicitação recusada não pode ser reaberta; envie uma nova solicitação', 409);
    if (Number(application.userId) === Number(requester.id)) throw new AppError('Você não pode aprovar a própria solicitação', 403);
    if (data.status === 'approved') {
      const applicant = await User.findByPk(application.userId);
      if (isPlatformAdmin(applicant)) throw new AppError('Uma conta da equipe Time Out não pode administrar um ambiente', 403);
    }
    const allowed = ['under_review', 'changes_requested', 'approved', 'rejected'];
    if (!allowed.includes(data.status)) throw new AppError('Decisão inválida', 400);
    if (['changes_requested', 'rejected'].includes(data.status) && !data.reason) throw new AppError('Informe a justificativa', 400);

    let generatedCode = null;
    await sequelize.transaction(async (transaction) => {
      if (data.status === 'approved') {
        generatedCode = generateEnvironmentAccessCode();
        const environment = await Environment.create({
          name: application.institutionName,
          type: application.institutionType,
          address: application.address,
          accessCode: null,
          accessCodeEnabled: true,
          isPrivate: data.isPrivate !== false,
          status: 'active',
        }, { transaction });
        await EnvironmentAccessCode.create({ environmentId: environment.id, codeHash: hashEnvironmentAccessCode(generatedCode), codePreview: `****${generatedCode.slice(-4)}`, isActive: true, createdBy: requester.id }, { transaction });
        await UserEnvironment.upsert({ userId: application.userId, environmentId: environment.id, role: 'environment_admin', status: 'approved', reviewedAt: new Date(), reviewedBy: requester.id }, { transaction });
        await User.update({ environmentId: environment.id, role: 'environment_admin' }, { where: { id: application.userId }, transaction });
        application.environmentId = environment.id;
      }
      await application.update({
        status: data.status,
        reviewedBy: requester.id,
        decisionReason: data.status === 'rejected' ? data.reason : null,
        correctionNotes: data.status === 'changes_requested' ? data.reason : null,
        decidedAt: ['approved', 'rejected'].includes(data.status) ? new Date() : null,
        history: appendHistory(application, data.status, requester.id, data.reason),
      }, { transaction });
      await NotificationService.create(application.userId, 'Solicitação de ambiente atualizada', data.status === 'approved' ? 'Ambiente aprovado. O código inicial foi exibido uma única vez ao responsável pela aprovação.' : data.status === 'changes_requested' ? `Correções solicitadas: ${data.reason}` : data.status === 'rejected' ? `Solicitação recusada: ${data.reason}` : 'Sua solicitação está em análise.', 'environment_application', '/access', transaction, { resourceType: 'environment_application', resourceId: application.id, environmentId: application.environmentId });
      await AuditService.record({ actorId: requester.id, action: `environment_application.${data.status}`, resourceType: 'environment_application', resourceId: application.id, environmentId: application.environmentId, summary: `Solicitação de ambiente alterada para ${data.status}` }, transaction);
    });
    return { application: sanitizeApplication(await EnvironmentApplication.findByPk(id)), generatedCode };
  }

  async getMyApplications(requester) {
    const [sellerApplications, environmentApplications] = await Promise.all([
      SellerRequest.findAll({ where: { userId: requester.id }, order: [['createdAt', 'DESC']] }),
      EnvironmentApplication.findAll({ where: { userId: requester.id }, order: [['createdAt', 'DESC']] }),
    ]);
    return {
      sellerApplications: sellerApplications.map((item) => sanitizeApplication(item)),
      environmentApplications: environmentApplications.map((item) => sanitizeApplication(item)),
      identityVerificationMode: this.ensureIdentityMode(),
    };
  }

  async listNotifications(requester) {
    const notifications = await Notification.findAll({ where: { userId: requester.id }, order: [['createdAt', 'DESC']], limit: 50 });
    return { notifications, unreadCount: notifications.filter((item) => !item.readAt).length };
  }

  async markNotificationRead(id, requester) {
    const notification = await Notification.findOne({ where: { id, userId: requester.id } });
    if (!notification) throw new AppError('Notificação não encontrada', 404);
    await notification.update({ readAt: new Date() });
    return notification;
  }

  async getEnvironmentDashboard(requester) {
    if (!isEnvironmentAdmin(requester) || !requester.environmentId) throw new AppError('Acesso restrito ao administrador do ambiente', 403);
    const [sellerApplications, memberships, accessCode, environment] = await Promise.all([
      SellerRequest.findAll({ where: { environmentId: requester.environmentId }, include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone', 'profileImageUrl'] }], order: [['createdAt', 'DESC']] }),
      UserEnvironment.findAll({ where: { environmentId: requester.environmentId }, include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'phone', 'profileImageUrl'] }], order: [['createdAt', 'DESC']] }),
      EnvironmentAccessCode.findOne({ where: { environmentId: requester.environmentId, isActive: true }, order: [['createdAt', 'DESC']] }),
      Environment.findByPk(requester.environmentId, { attributes: ['id', 'name', 'accessCodeEnabled', 'isPrivate', 'status'] }),
    ]);
    return { sellerApplications: sellerApplications.map((item) => sanitizeApplication(item)), memberships, accessCode, environment, identityVerificationMode: this.ensureIdentityMode() };
  }

  async reviewMembership(id, data, requester) {
    if (!isEnvironmentAdmin(requester)) throw new AppError('Acesso restrito ao administrador do ambiente', 403);
    const membership = await UserEnvironment.findByPk(id);
    if (!membership || Number(membership.environmentId) !== Number(requester.environmentId)) throw new AppError('Participação não encontrada', 404);
    if (Number(membership.userId) === Number(requester.id)) throw new AppError('Você não pode revisar sua própria participação', 403);
    if (!['approved', 'rejected', 'suspended'].includes(data.status)) throw new AppError('Status inválido', 400);
    if (['rejected', 'suspended'].includes(data.status) && !data.reason?.trim()) throw new AppError('Informe a justificativa da decisão', 400);
    if (['admin', 'environment_admin'].includes(membership.role)) throw new AppError('Somente a equipe Time Out pode alterar administradores', 403);
    const target = await User.findByPk(membership.userId);
    if (isPlatformAdmin(target) && membership.role !== 'customer') throw new AppError('A função da equipe Time Out não pode ser alterada por administradores de ambiente', 403);
    await sequelize.transaction(async (transaction) => {
      await membership.update({ status: data.status, reviewedAt: new Date(), reviewedBy: requester.id }, { transaction });
      if (data.status === 'approved' && !target.environmentId) {
        await target.update({ environmentId: membership.environmentId, ...(!isPlatformAdmin(target) && { role: membership.role }) }, { transaction, platformMembershipSwitch: isPlatformAdmin(target) });
      }
      if (['suspended', 'rejected'].includes(data.status) && Number(target.environmentId) === Number(membership.environmentId)) {
        await target.update({ environmentId: null, ...(!isPlatformAdmin(target) && { role: 'customer' }), tokenVersion: Number(target.tokenVersion || 0) + 1 }, { transaction, platformMembershipSwitch: isPlatformAdmin(target) });
      }
      await NotificationService.create(membership.userId, 'Participação no ambiente atualizada', `Sua entrada no ambiente foi ${data.status === 'approved' ? 'aprovada' : data.status === 'rejected' ? 'recusada' : 'suspensa'}. ${data.reason || ''}`, 'membership', '/access', transaction, { resourceType: 'membership', resourceId: membership.id, environmentId: membership.environmentId });
      await AuditService.record({ actorId: requester.id, action: `membership.${data.status}`, resourceType: 'membership', resourceId: membership.id, environmentId: membership.environmentId, summary: `Participação alterada para ${data.status}`, metadata: { reason: data.reason?.trim() || null } }, transaction);
    });
    return membership;
  }

  async rotateAccessCode(requester) {
    if (!isEnvironmentAdmin(requester)) throw new AppError('Acesso restrito ao administrador do ambiente', 403);
    const code = generateEnvironmentAccessCode();
    await sequelize.transaction(async (transaction) => {
      await EnvironmentAccessCode.update({ isActive: false, revokedAt: new Date() }, { where: { environmentId: requester.environmentId, isActive: true }, transaction });
      await EnvironmentAccessCode.create({ environmentId: requester.environmentId, codeHash: hashEnvironmentAccessCode(code), codePreview: `****${code.slice(-4)}`, isActive: true, createdBy: requester.id }, { transaction });
      await Environment.update({ accessCode: null, accessCodeEnabled: true }, { where: { id: requester.environmentId }, transaction });
      await AuditService.record({ actorId: requester.id, action: 'environment.access_code_rotated', resourceType: 'environment', resourceId: requester.environmentId, environmentId: requester.environmentId, summary: 'Código de acesso substituído' }, transaction);
    });
    return { accessCode: code };
  }

  async setAccessCodeEnabled(enabled, requester) {
    if (!isEnvironmentAdmin(requester)) throw new AppError('Acesso restrito ao administrador do ambiente', 403);
    await Environment.update({ accessCodeEnabled: enabled }, { where: { id: requester.environmentId } });
    await AuditService.record({ actorId: requester.id, action: enabled ? 'environment.access_code_enabled' : 'environment.access_code_disabled', resourceType: 'environment', resourceId: requester.environmentId, environmentId: requester.environmentId, summary: `Código de acesso ${enabled ? 'ativado' : 'desativado'}` });
    return { enabled };
  }

  async getPlatformDashboard(requester, { page = 1, limit = 20 } = {}) {
    if (!isPlatformAdmin(requester)) throw new AppError('Acesso restrito à equipe Time Out', 403);
    const safePage = Math.max(1, Number(page));
    const safeLimit = Math.min(50, Math.max(1, Number(limit)));
    const [applicationResult, environments, administrators, auditLogs, sellers] = await Promise.all([
      EnvironmentApplication.findAndCountAll({ include: [{ model: User, as: 'applicant', attributes: ['id', 'name', 'email', 'phone'] }, { model: Environment, as: 'environment', attributes: ['id', 'name', 'status', 'type', 'address'] }], order: [['createdAt', 'DESC']], limit: safeLimit, offset: (safePage - 1) * safeLimit, distinct: true }),
      Environment.findAll({ attributes: ['id', 'name', 'status', 'type', 'address', 'isPrivate', 'createdAt'], order: [['createdAt', 'DESC']] }),
      User.findAll({
        where: { role: ['environment_admin', 'admin'] },
        attributes: ['id', 'name', 'email', 'phone', 'environmentId'],
        include: [{ model: UserEnvironment, as: 'memberships', attributes: ['id', 'environmentId', 'role', 'status'] }],
        order: [['name', 'ASC']],
      }),
      AuditLog.findAll({ include: [{ model: User, as: 'actor', attributes: ['id', 'name', 'email'] }], order: [['createdAt', 'DESC']], limit: 100 }),
      SellerRequest.findAll({ attributes: ['id', 'userId', 'environmentId', 'storeName', 'status', 'createdAt'], include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }], order: [['createdAt', 'DESC']], limit: 50 }),
    ]);
    return { applications: applicationResult.rows.map((item) => sanitizeApplication(item)), applicationPagination: { page: safePage, limit: safeLimit, total: applicationResult.count, totalPages: Math.ceil(applicationResult.count / safeLimit) }, environments, administrators, auditLogs, sellers, identityVerificationMode: this.ensureIdentityMode() };
  }

  async getEnvironmentApplicationDetail(id, requester) {
    if (!isPlatformAdmin(requester)) throw new AppError('Acesso restrito à equipe Time Out', 403);
    const application = await EnvironmentApplication.findByPk(id, {
      include: [
        { model: User, as: 'applicant', attributes: ['id', 'name', 'email', 'phone', 'emailVerifiedAt', 'createdAt', 'isSuspended'] },
        { model: User, as: 'reviewer', attributes: ['id', 'name', 'email'] },
        { model: Environment, as: 'environment', attributes: ['id', 'name', 'status'] },
      ],
    });
    if (!application) throw new AppError('Solicitação de ambiente não encontrada', 404);
    const [previousApplications, administeredMemberships, decisions] = await Promise.all([
      EnvironmentApplication.findAll({ where: { userId: application.userId, id: { [Op.ne]: id } }, attributes: ['id', 'institutionName', 'status', 'decisionReason', 'createdAt', 'decidedAt'], order: [['createdAt', 'DESC']], limit: 20 }),
      UserEnvironment.findAll({ where: { userId: application.userId, role: ['admin', 'environment_admin'] }, attributes: ['environmentId', 'status', 'reviewedAt'], include: [{ model: Environment, as: 'environment', attributes: ['id', 'name', 'status'] }], limit: 20 }),
      AuditLog.findAll({ where: { resourceType: 'environment_application', resourceId: String(id) }, attributes: ['id', 'actorId', 'action', 'summary', 'metadata', 'createdAt'], order: [['createdAt', 'DESC']], limit: 50 }),
    ]);
    return { application: sanitizeApplication(application), previousApplications, administeredMemberships, decisions };
  }

  async getSellerRegularity(userId, requester) {
    if (!isPlatformAdmin(requester) && !isEnvironmentAdmin(requester)) throw new AppError('Acesso administrativo necessário', 403);
    const where = { userId, ...(!isPlatformAdmin(requester) && { environmentId: requester.environmentId }) };
    const application = await SellerRequest.findOne({ where, order: [['createdAt', 'DESC']], include: [{ model: User, as: 'reviewer', attributes: ['id', 'name'] }] });
    if (!application) throw new AppError('Solicitação de vendedor não encontrada', 404);
    const environmentId = application.environmentId;
    const [user, membership, environment, activeProducts, inactiveProducts, orders, delivered, canceled, refused, payoutAccount, decisions] = await Promise.all([
      User.findByPk(userId, { attributes: ['id', 'name', 'email', 'phone', 'emailVerifiedAt', 'cpf', 'isSuspended', 'createdAt'] }),
      UserEnvironment.findOne({ where: { userId, environmentId }, attributes: ['id', 'role', 'status', 'reviewedAt', 'reviewedBy'] }),
      Environment.findByPk(environmentId, { attributes: ['id', 'name', 'status'] }),
      Product.count({ where: { userId, environmentId, isActive: true } }),
      Product.count({ where: { userId, environmentId, isActive: false } }),
      Order.count({ where: { sellerId: userId, environmentId } }),
      Order.count({ where: { sellerId: userId, environmentId, status: 'delivered' } }),
      Order.count({ where: { sellerId: userId, environmentId, status: 'canceled' } }),
      Order.count({ where: { sellerId: userId, environmentId, status: 'refused' } }),
      SellerPayoutAccount.findOne({ where: { userId, environmentId }, attributes: ['status', 'connectedAt', 'suspendedAt'] }),
      AuditLog.findAll({ where: { resourceType: 'seller_application', resourceId: String(application.id) }, attributes: ['id', 'actorId', 'action', 'summary', 'metadata', 'createdAt'], order: [['createdAt', 'DESC']], limit: 50 }),
    ]);
    const status = application.status === 'approved' ? 'regular' : ['blocked', 'revoked'].includes(application.status) ? 'irregular' : application.status === 'under_review' ? 'pending' : application.status;
    return {
      user: user ? { id: user.id, name: user.name, email: user.email, phone: user.phone, emailVerifiedAt: user.emailVerifiedAt, cpfMasked: user.cpf ? maskCpf(user.cpf) : null, isSuspended: user.isSuspended, createdAt: user.createdAt } : null,
      environment, membership,
      application: sanitizeApplication(application),
      status,
      decisionReason: application.decisionReason || application.correctionNotes,
      documentAvailable: Boolean(application.documentPath),
      products: { active: activeProducts, inactive: inactiveProducts },
      orders: { total: orders, delivered, canceled, refused },
      payoutAccount: payoutAccount || { status: 'not_connected' },
      decisions,
      identityVerificationMode: this.ensureIdentityMode(),
    };
  }

  async getSellerApplicationDocument(id, reason, requester) {
    if (!reason?.trim()) throw new AppError('Informe o motivo para visualizar o comprovante', 400);
    const application = await SellerRequest.findByPk(id);
    if (!application?.documentPath) throw new AppError('Esta solicitação não possui comprovante', 404);
    if (!isPlatformAdmin(requester) && (!isEnvironmentAdmin(requester) || Number(requester.environmentId) !== Number(application.environmentId))) {
      throw new AppError('Acesso ao comprovante não autorizado', 403);
    }
    const privateRoot = path.resolve(process.env.PRIVATE_UPLOAD_PATH || 'private_documents');
    const documentPath = path.resolve(privateRoot, path.basename(application.documentPath));
    if (!documentPath.startsWith(`${privateRoot}${path.sep}`) || !fs.existsSync(documentPath)) throw new AppError('Comprovante não encontrado no servidor', 404);
    await AuditService.record({ actorId: requester.id, action: 'sensitive.document_viewed', resourceType: 'seller_application', resourceId: id, environmentId: application.environmentId, summary: 'Comprovante de vendedor visualizado', metadata: { reason: reason.trim() } });
    return documentPath;
  }

  async suspendEnvironment(id, suspended, reason, requester) {
    if (!isPlatformAdmin(requester)) throw new AppError('Acesso restrito à equipe Time Out', 403);
    if (!reason?.trim()) throw new AppError('Informe a justificativa da alteração', 400);
    const environment = await Environment.findByPk(id);
    if (!environment) throw new AppError('Ambiente não encontrado', 404);
    await environment.update({ status: suspended ? 'suspended' : 'active' });
    await AuditService.record({ actorId: requester.id, action: suspended ? 'environment.suspended' : 'environment.reactivated', resourceType: 'environment', resourceId: id, environmentId: id, summary: suspended ? 'Ambiente suspenso' : 'Ambiente reativado', metadata: { reason: reason.trim() } });
    return environment;
  }

  async transferEnvironment(id, userId, reason, requester) {
    if (!isPlatformAdmin(requester)) throw new AppError('Acesso restrito à equipe Time Out', 403);
    if (!reason?.trim()) throw new AppError('Informe a justificativa da transferência', 400);
    const membership = await UserEnvironment.findOne({ where: { userId, environmentId: id, status: 'approved' } });
    if (!membership) throw new AppError('O novo administrador precisa ser participante aprovado', 400);
    const target = await User.findByPk(userId);
    if (isPlatformAdmin(target)) throw new AppError('Uma conta da equipe Time Out não pode administrar um ambiente', 403);
    await sequelize.transaction(async (transaction) => {
      await UserEnvironment.update({ role: 'customer' }, { where: { environmentId: id, role: ['admin', 'environment_admin'] }, transaction });
      await User.update({ role: 'customer' }, { where: { environmentId: id, role: ['admin', 'environment_admin'] }, transaction });
      await membership.update({ role: 'environment_admin', reviewedAt: new Date(), reviewedBy: requester.id }, { transaction });
      await target.update({ environmentId: id, role: 'environment_admin' }, { transaction });
      await NotificationService.create(userId, 'Administração transferida', 'Você agora administra este ambiente.', 'environment_admin', '/admin-access', transaction);
      await AuditService.record({ actorId: requester.id, action: 'environment.admin_transferred', resourceType: 'environment', resourceId: id, environmentId: id, summary: `Administração transferida para o usuário ${userId}`, metadata: { reason: reason.trim() } }, transaction);
    });
    return { transferred: true };
  }

  async suspendAdministrator(id, suspended, reason, requester) {
    if (!isPlatformAdmin(requester)) throw new AppError('Acesso restrito à equipe Time Out', 403);
    if (!reason?.trim()) throw new AppError('Informe a justificativa da alteração', 400);
    const administrator = await User.findByPk(id);
    if (!administrator || !['admin', 'environment_admin'].includes(administrator.role)) {
      throw new AppError('Administrador de ambiente não encontrado', 404);
    }
    if (Number(administrator.id) === Number(requester.id)) {
      throw new AppError('Você não pode suspender seu próprio acesso', 403);
    }

    const environmentId = administrator.environmentId;
    await sequelize.transaction(async (transaction) => {
      if (environmentId) {
        await UserEnvironment.update(
          { status: suspended ? 'suspended' : 'approved', reviewedAt: new Date(), reviewedBy: requester.id },
          { where: { userId: administrator.id, environmentId, role: ['admin', 'environment_admin'] }, transaction }
        );
      }
      if (!suspended && administrator.role === 'admin') {
        await administrator.update({ role: 'environment_admin' }, { transaction });
      }
      await NotificationService.create(
        administrator.id,
        suspended ? 'Acesso administrativo suspenso' : 'Acesso administrativo reativado',
        suspended ? 'Seu acesso administrativo foi suspenso pela equipe Time Out.' : 'Seu acesso administrativo foi reativado pela equipe Time Out.',
        'environment_admin',
        '/access',
        transaction
      );
      await AuditService.record({
        actorId: requester.id,
        action: suspended ? 'environment_admin.suspended' : 'environment_admin.reactivated',
        resourceType: 'user',
        resourceId: administrator.id,
        environmentId,
        summary: suspended ? 'Administrador de ambiente suspenso' : 'Administrador de ambiente reativado',
        metadata: { reason: reason.trim() },
      }, transaction);
    });
    return { suspended };
  }

  async getEnvironmentApplicationDocument(id, reason, requester) {
    if (!isPlatformAdmin(requester)) throw new AppError('Acesso restrito à equipe Time Out', 403);
    if (!reason?.trim()) throw new AppError('Informe o motivo para visualizar o comprovante', 400);
    const application = await EnvironmentApplication.findByPk(id);
    if (!application?.documentPath) throw new AppError('Esta solicitação não possui comprovante', 404);

    const privateRoot = path.resolve(process.env.PRIVATE_UPLOAD_PATH || 'private_documents');
    const documentPath = path.resolve(privateRoot, path.basename(application.documentPath));
    if (!documentPath.startsWith(`${privateRoot}${path.sep}`) || !fs.existsSync(documentPath)) {
      throw new AppError('Comprovante não encontrado no servidor', 404);
    }
    await AuditService.record({
      actorId: requester.id,
      action: 'sensitive.document_viewed',
      resourceType: 'environment_application',
      resourceId: application.id,
      environmentId: application.environmentId,
      summary: 'Comprovante da solicitação visualizado',
      metadata: { reason: reason.trim() },
    });
    return documentPath;
  }

  async revealCpf(type, id, reason, requester) {
    if (!reason?.trim()) throw new AppError('Informe o motivo para visualizar o CPF', 400);
    const isSeller = type === 'seller';
    const application = isSeller ? await SellerRequest.findByPk(id) : await EnvironmentApplication.findByPk(id);
    if (!application) throw new AppError('Solicitação não encontrada', 404);
    const allowed = isSeller
      ? isPlatformAdmin(requester) || (isEnvironmentAdmin(requester) && Number(application.environmentId) === Number(requester.environmentId))
      : isPlatformAdmin(requester);
    if (!allowed) throw new AppError('Acesso ao CPF não autorizado', 403);
    if (isSeller && !isPlatformAdmin(requester)) {
      const [environment, membership] = await Promise.all([
        Environment.findByPk(requester.environmentId, { attributes: ['status'] }),
        UserEnvironment.findOne({ where: { userId: requester.id, environmentId: requester.environmentId }, attributes: ['status', 'role'] }),
      ]);
      if (environment?.status !== 'active' || membership?.status !== 'approved' || !['admin', 'environment_admin'].includes(membership.role)) {
        throw new AppError('Acesso ao CPF não autorizado neste ambiente', 403);
      }
    }
    const user = await User.findByPk(application.userId, { attributes: ['cpf'] });
    const cpf = isSeller ? user?.cpf : application.cpf;
    await AuditService.record({ actorId: requester.id, action: 'sensitive.cpf_viewed', resourceType: `${type}_application`, resourceId: id, environmentId: application.environmentId, summary: 'CPF completo visualizado para análise', metadata: { reason: reason.trim() } });
    return { cpf };
  }
}

module.exports = new AccessControlService();
