const Joi = require('joi');
const { isValidBrazilPhone } = require('../utils/security');

const phoneSchema = Joi.string()
  .trim()
  .max(30)
  .allow('', null)
  .custom((value, helpers) => {
    if (!value || isValidBrazilPhone(value)) return value;
    return helpers.error('phone.invalid');
  })
  .messages({
    'phone.invalid': 'Informe um telefone brasileiro válido com DDD',
  });

module.exports = { phoneSchema };
