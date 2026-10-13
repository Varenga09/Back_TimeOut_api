const crypto = require('crypto');
const { sequelize, User } = require('../models');
const AppError = require('../utils/AppError');
const AuditService = require('./AuditService');

const PRODUCTION_CONFIRMATION = 'TIMEOUT_PRODUCTION';

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function secretsMatch(configuredSecret, providedSecret) {
  const configured = Buffer.from(String(configuredSecret || ''));
  const provided = Buffer.from(String(providedSecret || ''));
  return configured.length > 0 && configured.length === provided.length && crypto.timingSafeEqual(configured, provided);
}

function assertBootstrapAuthorization({ nodeEnv, confirmation, configuredSecret, providedSecret }) {
  if (nodeEnv !== 'production') {
    throw new AppError('Este comando administrativo só pode operar com NODE_ENV=production', 400);
  }
  if (confirmation !== PRODUCTION_CONFIRMATION) {
    throw new AppError(`Confirmação obrigatória ausente. Use --confirm-production=${PRODUCTION_CONFIRMATION}`, 400);
  }
  if (!configuredSecret || String(configuredSecret).length < 32) {
    throw new AppError('PLATFORM_ADMIN_BOOTSTRAP_SECRET não está configurado com segurança no servidor', 403);
  }
  if (!secretsMatch(configuredSecret, providedSecret)) {
    throw new AppError('Autorização administrativa inválida', 403);
  }
}

function safeAccountResult(user, extra = {}) {
  return {
    email: user.email,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    ...extra,
  };
}

class PlatformAdminService {
  authorize(options) {
    assertBootstrapAuthorization(options);
  }

  async inspectAccount({ email, ...authorization }) {
    this.authorize(authorization);
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new AppError('Informe o e-mail da conta', 400);

    const user = await User.findOne({
      where: { email: normalizedEmail },
      attributes: ['email', 'role', 'emailVerifiedAt'],
    });
    if (!user) throw new AppError('Usuário não encontrado. Conclua primeiro o cadastro normal no site', 404);
    return safeAccountResult(user);
  }

  async grant({ email, actorUserId = null, ...authorization }) {
    this.authorize(authorization);
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) throw new AppError('Informe o e-mail da conta', 400);

    return sequelize.transaction(async (transaction) => {
      const user = await User.findOne({
        where: { email: normalizedEmail },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!user) throw new AppError('Usuário não encontrado. Conclua primeiro o cadastro normal no site', 404);
      if (actorUserId && Number(actorUserId) === Number(user.id)) {
        throw new AppError('Autopromoção não é permitida', 403);
      }
      if (!user.emailVerifiedAt) {
        throw new AppError('O e-mail da conta ainda não foi confirmado', 409);
      }

      if (user.role === 'platform_admin') {
        return safeAccountResult(user, { changed: false, sessionsInvalidated: false });
      }

      await user.update({
        role: 'platform_admin',
        tokenVersion: Number(user.tokenVersion || 0) + 1,
      }, { transaction });
      await AuditService.record({
        actorId: null,
        action: 'platform_admin.granted_by_bootstrap',
        resourceType: 'user',
        resourceId: user.id,
        summary: 'Acesso interno da equipe Time Out concedido por comando administrativo seguro',
      }, transaction);

      return safeAccountResult(user, { changed: true, sessionsInvalidated: true });
    });
  }

  async assertCanRemove(userId, transaction = null) {
    const target = await User.findByPk(userId, { transaction, lock: transaction?.LOCK?.UPDATE });
    if (!target || target.role !== 'platform_admin') return true;

    const platformAdminCount = await User.count({ where: { role: 'platform_admin' }, transaction });
    if (platformAdminCount <= 1) {
      throw new AppError('O último administrador interno da Time Out não pode ser removido ou suspenso', 409);
    }
    return true;
  }
}

module.exports = new PlatformAdminService();
module.exports.normalizeEmail = normalizeEmail;
module.exports.assertBootstrapAuthorization = assertBootstrapAuthorization;
module.exports.PRODUCTION_CONFIRMATION = PRODUCTION_CONFIRMATION;
