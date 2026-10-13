const { Notification, UserEnvironment, User } = require('../models');

class InternalNotificationService {
  create(userId, title, message, type, internalLink = null, transaction = null, target = {}) {
    const legacyViews = { '/access': 'access', '/admin-access': 'admin-access', '/platform': 'platform-access', '/profile': 'profile' };
    return Notification.create({
      userId, title, message, type, internalLink,
      targetView: target.targetView || legacyViews[internalLink] || null,
      resourceType: target.resourceType || null,
      resourceId: target.resourceId == null ? null : String(target.resourceId),
      environmentId: target.environmentId || null,
    }, { transaction });
  }

  async notifyEnvironmentAdmins(environmentId, title, message, type, internalLink = null, transaction = null, target = {}) {
    const memberships = await UserEnvironment.findAll({
      where: { environmentId, role: ['admin', 'environment_admin'], status: 'approved' },
      attributes: ['userId'],
      transaction,
    });
    return Promise.all(memberships.map(({ userId }) => this.create(userId, title, message, type, internalLink, transaction, { environmentId, ...target })));
  }

  async notifyPlatformAdmins(title, message, type, internalLink = null, transaction = null, target = {}) {
    const users = await User.findAll({ where: { role: 'platform_admin' }, attributes: ['id'], transaction });
    return Promise.all(users.map(({ id }) => this.create(id, title, message, type, internalLink, transaction, target)));
  }
}

module.exports = new InternalNotificationService();
