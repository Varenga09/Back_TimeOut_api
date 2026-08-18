const EnvironmentService = require('../services/EnvironmentService');
const { successResponse } = require('../utils/response');

class EnvironmentController {
  async create(req, res, next) {
    try {
      const result = await EnvironmentService.create(req.body, req.user);
      return successResponse(res, result, 'Ambiente criado com sucesso', 201);
    } catch (error) {
      return next(error);
    }
  }

  async getAll(req, res, next) {
    try {
      const result = await EnvironmentService.getAll(req.query);
      return successResponse(res, result, 'Ambientes listados com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const environment = await EnvironmentService.getById(req.params.id, req.user);
      return successResponse(res, { environment }, 'Ambiente encontrado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async join(req, res, next) {
    try {
      const user = await EnvironmentService.join(req.body.accessCode, req.user);
      return successResponse(res, { user }, 'Você entrou no ambiente com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async switch(req, res, next) {
    try {
      const user = await EnvironmentService.switch(req.params.id, req.user);
      return successResponse(res, { user }, 'Ambiente ativo alterado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async listUsers(req, res, next) {
    try {
      const result = await EnvironmentService.listUsers(req.params.id, req.user, req.query);
      return successResponse(res, result, 'Usuários do ambiente listados com sucesso');
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new EnvironmentController();
