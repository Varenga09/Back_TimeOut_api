const { Notification, UserEnvironment, User } = require('../models');

class InternalNotificationService {
  create(userId, title, message, type, internalLink = null, transaction = null) {
    return Notification.create({ userId, title, message, type, internalLink }, { transaction });
  }

  async notifyEnvironmentAdmins(environmentId, title, message, type, internalLink = null, transaction = null) {
    const memberships = await UserEnvironment.findAll({
      where: { environmentId, role: ['admin', 'environment_admin'], status: 'approved' },
      attributes: ['userId'],
      transaction,
    });
    return Promise.all(memberships.map(({ userId }) => this.create(userId, title, message, type, internalLink, transaction)));
  }

  async notifyPlatformAdmins(title, message, type, internalLink = null, transaction = null) {
    const users = await User.findAll({ where: { role: 'platform_admin' }, attributes: ['id'], transaction });
    return Promise.all(users.map(({ id }) => this.create(id, title, message, type, internalLink, transaction)));
  }
}

module.exports = new InternalNotificationService();
