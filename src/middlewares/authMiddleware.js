const jwt = require('jsonwebtoken');
const { User } = require('../models');
const AppError = require('../utils/AppError');

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Token de autenticação não fornecido', 401));
  }

  if (!process.env.JWT_SECRET) {
    return next(new AppError('JWT_SECRET não configurado', 500));
  }

  const token = authHeader.split(' ')[1];
  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return next(new AppError('Token expirado. Faca login novamente', 401));
    }

    return next(new AppError('Token inválido', 401));
  }

  try {
    const user = await User.findByPk(decoded.id, {
      attributes: ['id', 'email', 'phone', 'role', 'environmentId', 'emailVerifiedAt', 'phoneVerifiedAt', 'cpfVerifiedAt'],
    });

    if (!user) {
      return next(new AppError('Usuário autenticado não encontrado', 401));
    }

    // Usa os dados atuais do banco, mesmo se o token tiver uma role antiga.
    req.user = user.toJSON();
    return next();
  } catch (error) {
    return next(error);
  }
};

module.exports = authMiddleware;
