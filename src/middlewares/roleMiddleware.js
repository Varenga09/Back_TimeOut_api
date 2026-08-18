const AppError = require('../utils/AppError');

const roleMiddleware = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Usuário não autenticado', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Você não tem permissão para acessar este recurso', 403));
    }

    return next();
  };
};

module.exports = roleMiddleware;
