const { Op } = require('sequelize');
const { User, Environment, UserEnvironment } = require('../models');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');

const safeUserAttributes = {
  exclude: ['password', 'emailVerificationCode', 'emailVerificationExpiresAt', 'cpf'],
};

const userIncludes = [
  { model: Environment, as: 'environment' },
  {
    model: UserEnvironment,
    as: 'memberships',
    include: [{ model: Environment, as: 'environment' }],
  },
];

class UserRepository {
  async create(data) {
    return User.create(data);
  }

  async findByEmail(email) {
    return User.findOne({
      where: { email },
      include: userIncludes,
    });
  }

  async findByCpf(cpf) {
    return User.findOne({
      where: { cpf },
    });
  }

  async findById(id) {
    return User.findByPk(id, {
      attributes: safeUserAttributes,
      include: userIncludes,
    });
  }

  async findRawById(id) {
    return User.findByPk(id);
  }

  async findAll({ environmentId, role, search, page = 1, limit = 10 } = {}) {
    const pagination = getPagination({ page, limit });
    const where = {};

    if (environmentId) where.environmentId = environmentId;
    if (role) where.role = role;
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
      ];
    }

    const { count, rows } = await User.findAndCountAll({
      where,
      attributes: safeUserAttributes,
      include: userIncludes,
      limit: pagination.limit,
      offset: pagination.offset,
      order: [['name', 'ASC']],
    });

    return {
      users: rows,
      ...buildPaginationMeta({ count, page: pagination.page, limit: pagination.limit }),
    };
  }

  async update(id, data) {
    const user = await User.findByPk(id);
    if (!user) return null;

    if (Object.keys(data).length > 0) {
      await user.update(data);
    }
    return this.findById(id);
  }

  async delete(id) {
    const user = await User.findByPk(id);
    if (!user) return false;

    await user.destroy();
    return true;
  }
}

module.exports = new UserRepository();
