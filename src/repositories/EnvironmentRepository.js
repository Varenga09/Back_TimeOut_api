const { Environment } = require('../models');
const UserEnvironmentRepository = require('./UserEnvironmentRepository');
const { getPagination, buildPaginationMeta } = require('../utils/pagination');

class EnvironmentRepository {
  async create(data) {
    return Environment.create(data);
  }

  async findAll(query = {}) {
    const { page, limit, offset } = getPagination(query);
    const { count, rows } = await Environment.findAndCountAll({
      limit,
      offset,
      order: [['createdAt', 'DESC']],
    });

    return {
      environments: rows,
      ...buildPaginationMeta({ count, page, limit }),
    };
  }

  async findById(id) {
    return Environment.findByPk(id);
  }

  async findByAccessCode(accessCode) {
    return Environment.findOne({ where: { accessCode } });
  }

  async listUsers(environmentId, query = {}) {
    const { page, limit, offset } = getPagination(query);
    const { count, rows } = await UserEnvironmentRepository.listUsers(environmentId, {
      role: query.role,
      search: query.search,
      limit,
      offset,
    });

    return {
      users: rows.map((membership) => ({
        ...membership.user.toJSON(),
        role: membership.role,
        membershipId: membership.id,
      })),
      ...buildPaginationMeta({ count, page, limit }),
    };
  }
}

module.exports = new EnvironmentRepository();
