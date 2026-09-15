const Joi = require('joi');

const strongPasswordSchema = Joi.string()
  .min(8)
  .max(64)
  .pattern(/[a-z]/, 'letra minúscula')
  .pattern(/[A-Z]/, 'letra maiúscula')
  .pattern(/\d/, 'número')
  .pattern(/[!@#$%^&*(),.?":{}|<>]/, 'caractere especial')
  .messages({
    'string.min': 'A senha deve ter pelo menos 8 caracteres',
    'string.max': 'A senha deve ter no máximo 64 caracteres',
    'string.pattern.name': 'A senha precisa conter pelo menos uma {#name}',
  });

module.exports = { strongPasswordSchema };
