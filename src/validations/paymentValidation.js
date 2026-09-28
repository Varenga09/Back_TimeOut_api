const Joi = require('joi');

const updatePaymentSettingsSchema = Joi.object({
  provider: Joi.string().valid('manual', 'mercado_pago').optional(),
  providerAccountId: Joi.string().trim().max(120).allow('', null).optional(),
  acceptsPix: Joi.boolean().required(),
  acceptsCreditCard: Joi.boolean().required(),
  acceptsDebitCard: Joi.boolean().required(),
  acceptsCash: Joi.boolean().required(),
  acceptsCardInPerson: Joi.boolean().required(),
  acceptsArrangeWithSeller: Joi.boolean().required(),
  isActive: Joi.boolean().required(),
});

const sellerIdParamSchema = Joi.object({
  sellerId: Joi.number().integer().positive().required(),
});

const simulatePaymentSchema = Joi.object({
  status: Joi.string().valid('approved', 'pending', 'declined').required(),
});

module.exports = {
  updatePaymentSettingsSchema,
  sellerIdParamSchema,
  simulatePaymentSchema,
};
