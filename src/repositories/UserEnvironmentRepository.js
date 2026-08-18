const { UserEnvironment, Environment, User } = require('../models');

class UserEnvironmentRepository {
  async findOne(userId, environmentId) {
    return UserEnvironment.findOne({
      where: { userId, environmentId },
      include: [{ model: Environment, as: 'environment' }],
    });
  }

  async listByUser(userId) {
    return UserEnvironment.findAll({
      where: { userId },
      include: [{ model: Environment, as: 'environment' }],
      order: [[{ model: Environment, as: 'environment' }, 'name', 'ASC']],
    });
  }

  async listUsers(environmentId, { role, search, limit, offset } = {}) {
    const where = { environmentId };
    if (role) where.role = role;

    const userWhere = {};
    if (search) {
      const { Op } = require('sequelize');
      userWhere[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    }

    return UserEnvironment.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'user',
          where: userWhere,
          attributes: {
            exclude: ['password', 'emailVerificationCode', 'emailVerificationExpiresAt', 'cpf'],
          },
        },
      ],
      distinct: true,
      limit,
      offset,
      order: [[{ model: User, as: 'user' }, 'name', 'ASC']],
    });
  }

  async upsert(userId, environmentId, role = 'customer') {
    const existing = await UserEnvironment.findOne({ where: { userId, environmentId } });
    if (existing) {
      await existing.update({ role });
      return this.findOne(userId, environmentId);
    }

    return UserEnvironment.create({ userId, environmentId, role });
  }

  async createIfMissing(userId, environmentId, role = 'customer') {
    const existing = await UserEnvironment.findOne({ where: { userId, environmentId } });
    if (existing) return existing;

    return UserEnvironment.create({ userId, environmentId, role });
  }
}

module.exports = new UserEnvironmentRepository();
