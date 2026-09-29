const Joi = require('joi');
const { paginationSchema } = require('./commonValidation');

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

const connectPayoutAccountSchema = Joi.object({
  responsibleName: Joi.string().trim().min(3).max(120).required(),
  storeName: Joi.string().trim().min(2).max(120).required(),
  acceptedTestTerms: Joi.boolean().truthy('true').valid(true).required(),
  pixKey: Joi.forbidden(),
  bank: Joi.forbidden(),
  agency: Joi.forbidden(),
  account: Joi.forbidden(),
  bankAccount: Joi.forbidden(),
  cardNumber: Joi.forbidden(),
  password: Joi.forbidden(),
});

const payoutStatusSchema = Joi.object({
  suspended: Joi.boolean().required(),
});

const payoutHistoryQuerySchema = Joi.object({
  ...paginationSchema,
  status: Joi.string().valid('pending', 'approved', 'held', 'settled', 'declined', 'refunded').empty('').optional(),
  dateFrom: Joi.string().isoDate().empty('').optional(),
  dateTo: Joi.string().isoDate().empty('').min(Joi.ref('dateFrom')).optional(),
  order: Joi.string().valid('asc', 'desc').default('desc'),
  environmentId: Joi.number().integer().positive().empty('').optional(),
});

module.exports = {
  updatePaymentSettingsSchema,
  sellerIdParamSchema,
  simulatePaymentSchema,
  connectPayoutAccountSchema,
  payoutStatusSchema,
  payoutHistoryQuerySchema,
};
