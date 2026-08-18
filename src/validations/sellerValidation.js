const Joi = require('joi');

const requestSellerSchema = Joi.object({
  cpf: Joi.string().trim().min(11).max(14).required().messages({
    'any.required': 'CPF é obrigatório para ativar vendedor',
  }),
});

module.exports = {
  requestSellerSchema,
};
