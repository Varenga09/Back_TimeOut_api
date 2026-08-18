const AuthService = require('../services/AuthService');
const { successResponse } = require('../utils/response');

class AuthController {
  async register(req, res, next) {
    try {
      const result = await AuthService.register(req.body);
      return successResponse(res, result, 'Usuário registrado com sucesso', 201);
    } catch (error) {
      return next(error);
    }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body;
      const result = await AuthService.login(email, password);
      return successResponse(res, result, 'Login realizado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async me(req, res, next) {
    try {
      const user = await AuthService.me(req.user.id);
      return successResponse(res, { user }, 'Usuário autenticado');
    } catch (error) {
      return next(error);
    }
  }

  async verifyEmail(req, res, next) {
    try {
      const user = await AuthService.verifyEmail(req.user.id, req.body.code);
      return successResponse(res, { user }, 'E-mail confirmado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async resendVerification(req, res, next) {
    try {
      const result = await AuthService.resendVerification(req.user.id, req.body.channel);
      return successResponse(res, result, 'Código de verificação enviado');
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new AuthController();
