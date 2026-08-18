const Joi = require('joi');
const { paginationSchema } = require('./commonValidation');

const couponPayloadSchema = {
  code: Joi.string().trim().uppercase().min(3).max(40).required(),
  description: Joi.string().trim().max(255).allow('', null).optional(),
  discountType: Joi.string().valid('percentage', 'fixed').required(),
  discountValue: Joi.number().precision(2).positive().required(),
  startsAt: Joi.date().allow('', null).optional(),
  endsAt: Joi.date().allow('', null).optional(),
  usageLimit: Joi.number().integer().min(1).allow(null).optional(),
  isActive: Joi.boolean().default(true),
};

const createCouponSchema = Joi.object(couponPayloadSchema);

const updateCouponSchema = Joi.object({
  ...couponPayloadSchema,
  code: Joi.string().trim().uppercase().min(3).max(40),
  discountType: Joi.string().valid('percentage', 'fixed'),
  discountValue: Joi.number().precision(2).positive(),
  isActive: Joi.boolean(),
})
  .min(1)
  .messages({
    'object.min': 'Informe pelo menos um campo para atualizar',
  });

const updateCouponStatusSchema = Joi.object({
  isActive: Joi.boolean().required(),
});

const listCouponsQuerySchema = Joi.object({
  ...paginationSchema,
  search: Joi.string().trim().max(120).empty('').optional(),
});

module.exports = {
  createCouponSchema,
  updateCouponSchema,
  updateCouponStatusSchema,
  listCouponsQuerySchema,
};
