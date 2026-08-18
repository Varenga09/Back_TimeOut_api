const Joi = require('joi');

const idParamSchema = Joi.object({
  id: Joi.number().integer().positive().required().messages({
    'number.base': 'O id deve ser um numero',
    'number.integer': 'O id deve ser inteiro',
    'number.positive': 'O id deve ser maior que zero',
    'any.required': 'O id é obrigatório',
  }),
});

const paginationSchema = {
  page: Joi.number().integer().positive().default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
};

module.exports = { idParamSchema, paginationSchema };
