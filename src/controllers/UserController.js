const UserService = require('../services/UserService');
const { successResponse } = require('../utils/response');

class UserController {
  async getAll(req, res, next) {
    try {
      const result = await UserService.getAll(req.query, req.user);
      return successResponse(res, result, 'Usuários listados com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const user = await UserService.getById(req.params.id, req.user);
      return successResponse(res, { user }, 'Usuário encontrado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async update(req, res, next) {
    try {
      const user = await UserService.update(req.params.id, req.body, req.user, req.file);
      return successResponse(res, { user }, 'Usuário atualizado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async delete(req, res, next) {
    try {
      await UserService.delete(req.params.id, req.user);
      return successResponse(res, null, 'Usuário deletado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async becomeAdmin(req, res, next) {
    try {
      const user = await UserService.becomeAdmin(
        req.user,
        req.body.adminCode,
        req.body.currentPassword
      );
      return successResponse(res, { user }, 'Perfil de administrador ativado com sucesso');
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new UserController();
