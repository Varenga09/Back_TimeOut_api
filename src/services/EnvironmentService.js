const EnvironmentRepository = require('../repositories/EnvironmentRepository');
const UserEnvironmentRepository = require('../repositories/UserEnvironmentRepository');
const UserRepository = require('../repositories/UserRepository');
const AppError = require('../utils/AppError');

class EnvironmentService {
  async create(data, requester = null) {
    const accessCode = data.accessCode || await this.generateAccessCode(data.name);
    const existing = await EnvironmentRepository.findByAccessCode(accessCode);
    if (existing) {
      throw new AppError('Este código de acesso já está em uso', 409);
    }

    const environment = await EnvironmentRepository.create({
      ...data,
      accessCode,
    });

    if (!requester) {
      return { environment };
    }

    await UserEnvironmentRepository.upsert(requester.id, environment.id, 'admin');
    const user = await UserRepository.update(requester.id, {
      environmentId: environment.id,
      role: 'admin',
    });

    return { environment, user };
  }

  async generateAccessCode(name) {
    const prefix = String(name || 'LOCAL')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 8) || 'LOCAL';

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
      const accessCode = `${prefix}${suffix}`;
      const existing = await EnvironmentRepository.findByAccessCode(accessCode);
      if (!existing) return accessCode;
    }

    throw new AppError('Não foi possível gerar um código único para o ambiente', 500);
  }

  async getAll(query) {
    return EnvironmentRepository.findAll(query);
  }

  async getById(id, requester) {
    const environment = await EnvironmentRepository.findById(id);
    if (!environment) {
      throw new AppError('Ambiente não encontrado', 404);
    }

    if (requester.role !== 'admin' && Number(requester.environmentId) !== Number(id)) {
      throw new AppError('Você não tem acesso a este ambiente', 403);
    }

    return environment;
  }

  async join(accessCode, requester) {
    const environment = await EnvironmentRepository.findByAccessCode(accessCode);
    if (!environment) {
      throw new AppError('Código de ambiente inválido', 404);
    }

    const membership = await UserEnvironmentRepository.createIfMissing(
      requester.id,
      environment.id,
      'customer'
    );

    return UserRepository.update(requester.id, {
      environmentId: environment.id,
      role: membership.role,
    });
  }

  async switch(environmentId, requester) {
    const membership = await UserEnvironmentRepository.findOne(requester.id, environmentId);
    if (!membership) {
      throw new AppError('Você ainda não faz parte deste ambiente', 403);
    }

    return UserRepository.update(requester.id, {
      environmentId: membership.environmentId,
      role: membership.role,
    });
  }

  async listUsers(environmentId, requester, query) {
    if (requester.role !== 'admin' || Number(requester.environmentId) !== Number(environmentId)) {
      throw new AppError('Apenas o admin do ambiente pode listar usuários', 403);
    }

    return EnvironmentRepository.listUsers(environmentId, query);
  }
}

module.exports = new EnvironmentService();
