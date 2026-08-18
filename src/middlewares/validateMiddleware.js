const AppError = require('../utils/AppError');

const validateMiddleware = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property] || {}, {
      abortEarly: false,
      convert: true,
      stripUnknown: true,
    });

    if (error) {
      const messages = error.details.map((detail) => detail.message);
      return next(new AppError(messages[0], 400, { errors: messages }));
    }

    req[property] = value;
    return next();
  };
};

module.exports = { validateMiddleware };
