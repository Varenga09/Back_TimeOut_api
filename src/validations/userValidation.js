const Joi = require('joi');
const { paginationSchema } = require('./commonValidation');

const emailSchema = Joi.string().trim().lowercase().email({ tlds: { allow: false } });

const listUsersQuerySchema = Joi.object({
  ...paginationSchema,
  role: Joi.string().valid('customer', 'seller', 'admin').empty('').optional(),
  search: Joi.string().trim().max(120).empty('').optional(),
});

const updateUserSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  email: emailSchema,
  password: Joi.string().min(6),
  phone: Joi.string().trim().max(30).allow('', null),
  profileImageUrl: Joi.string().trim().max(255).allow('', null),
  role: Joi.string().valid('customer', 'seller', 'admin'),
})
  .min(1)
  .messages({
    'object.min': 'Informe pelo menos um campo para atualizar',
  });

const becomeAdminSchema = Joi.object({
  adminCode: Joi.string().trim().min(4).max(80).required(),
});

module.exports = { listUsersQuerySchema, updateUserSchema, becomeAdminSchema };
