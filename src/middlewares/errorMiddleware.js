const AppError = require('../utils/AppError');

const handleSequelizeError = (error) => {
  if (error.name === 'SequelizeValidationError') {
    const messages = error.errors.map((item) => item.message);
    return new AppError(messages[0], 400, { errors: messages });
  }

  if (error.name === 'SequelizeUniqueConstraintError') {
    const field = error.errors[0]?.path || 'campo';
    return new AppError(`Este ${field} já está em uso`, 409, { field });
  }

  if (error.name === 'SequelizeForeignKeyConstraintError') {
    return new AppError('Referência inválida: registro relacionado não encontrado', 400);
  }

  return error;
};

// eslint-disable-next-line no-unused-vars
const errorMiddleware = (error, req, res, next) => {
  let err = handleSequelizeError(error);

  if (!(err instanceof AppError)) {
    console.error('Erro não operacional:', err);
    err = new AppError('Erro interno do servidor', 500);
  }

  const errorPayload = { ...(err.details || {}) };

  if (process.env.NODE_ENV === 'development' && err.statusCode >= 500) {
    errorPayload.stack = err.stack;
  }

  return res.status(err.statusCode).json({
    success: false,
    message: err.message,
    error: errorPayload,
  });
};

module.exports = errorMiddleware;
