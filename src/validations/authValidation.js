const Joi = require('joi');
const { strongPasswordSchema } = require('./passwordValidation');
const { phoneSchema } = require('./phoneValidation');

const emailSchema = Joi.string().trim().lowercase().email({ tlds: { allow: false } });

const registerSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  email: emailSchema.required(),
  password: strongPasswordSchema.required(),
  phone: phoneSchema.optional(),
  environmentAccessCode: Joi.string().trim().max(50).required(),
}).messages({
  'any.required': 'Campo obrigatório ausente',
});

const loginSchema = Joi.object({
  email: emailSchema.required(),
  password: Joi.string().required(),
});

const verifyEmailSchema = Joi.object({
  code: Joi.string().trim().length(6).required().messages({
    'any.required': 'Código de verificação obrigatório',
  }),
});

const resendVerificationSchema = Joi.object({
  channel: Joi.string().valid('email', 'sms', 'whatsapp').default('email'),
});

const forgotPasswordSchema = Joi.object({
  email: emailSchema.required(),
});

const resetPasswordSchema = Joi.object({
  email: emailSchema.required(),
  code: Joi.string().trim().pattern(/^\d{6}$/).required(),
  password: strongPasswordSchema.required(),
});

module.exports = {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
};
