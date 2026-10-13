const { Environment, UserEnvironment } = require('../models');
const AppError = require('../utils/AppError');

module.exports = async (req, res, next) => {
  try {
    if (req.user.isSuspended) return next(new AppError('Esta conta está suspensa', 403));
    if (!req.user.environmentId) {
      return next(new AppError('Entre em um ambiente aprovado para acessar o catálogo e comprar', 403));
    }
    const [environment, membership] = await Promise.all([
      Environment.findByPk(req.user.environmentId, { attributes: ['status'] }),
      UserEnvironment.findOne({
        where: { userId: req.user.id, environmentId: req.user.environmentId },
        attributes: ['status', 'role'],
      }),
    ]);
    if (environment?.status !== 'active' || membership?.status !== 'approved') {
      return next(new AppError('Sua participação neste ambiente não está aprovada ou ativa', 403));
    }
    req.membership = membership;
    return next();
  } catch (error) {
    return next(error);
  }
};
