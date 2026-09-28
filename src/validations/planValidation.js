const Joi = require('joi');

const changePlanSchema = Joi.object({
  planCode: Joi.string().valid('basic', 'pro').required(),
});

const institutionalConfigSchema = Joi.object({
  displayName: Joi.string().trim().max(120).allow('', null),
  imageUrl: Joi.string().uri().max(500).allow('', null),
  monthlyPrice: Joi.number().min(0).max(999999).precision(2).allow(null),
  commissionRate: Joi.number().min(0).max(100).precision(2).allow(null),
  notes: Joi.string().trim().max(1000).allow('', null),
});

module.exports = { changePlanSchema, institutionalConfigSchema };
