const AppError = require('../utils/AppError');

const emailVerifiedMiddleware = (req, res, next) => {
  if (!req.user?.emailVerifiedAt && !req.user?.phoneVerifiedAt) {
    return next(new AppError('Confirme sua conta antes de continuar', 403, {
      code: 'ACCOUNT_NOT_VERIFIED',
    }));
  }

  return next();
};

module.exports = emailVerifiedMiddleware;
