const Joi = require('joi');
const { phoneSchema } = require('./phoneValidation');

const cpfSchema = Joi.string().trim().min(11).max(14).required();
const decisionSchema = Joi.object({
  status: Joi.string().valid('under_review', 'changes_requested', 'approved', 'rejected', 'suspended', 'revoked').required(),
  reason: Joi.string().trim().max(1000).allow('', null),
  isPrivate: Joi.boolean().optional(),
});

const sellerApplicationSchema = Joi.object({
  fullName: Joi.string().trim().min(3).max(120).required(),
  cpf: cpfSchema,
  birthDate: Joi.date().iso().less('now').required(),
  phone: phoneSchema.required(),
  storeName: Joi.string().trim().min(2).max(120).required(),
  activityDescription: Joi.string().trim().min(10).max(2000).required(),
  productCategories: Joi.alternatives().try(Joi.array().items(Joi.string().trim().max(80)).min(1), Joi.string().trim().min(2)).required(),
  reason: Joi.string().trim().min(10).max(2000).required(),
  acceptedTerms: Joi.boolean().truthy('true').truthy('1').valid(true).required(),
});

const environmentApplicationSchema = Joi.object({
  responsibleName: Joi.string().trim().min(3).max(120).required(),
  cpf: cpfSchema,
  phone: phoneSchema.required(),
  institutionName: Joi.string().trim().min(2).max(160).required(),
  institutionType: Joi.string().valid('school', 'company', 'factory', 'college', 'office', 'other').required(),
  cnpj: Joi.string().trim().max(18).allow('', null),
  address: Joi.string().trim().min(5).max(255).required(),
  relationship: Joi.string().trim().min(2).max(160).required(),
  justification: Joi.string().trim().min(10).max(2000).required(),
  environmentDescription: Joi.string().trim().min(10).max(2000).required(),
});

const membershipDecisionSchema = Joi.object({ status: Joi.string().valid('approved', 'rejected', 'suspended').required() });
const enabledSchema = Joi.object({ enabled: Joi.boolean().required() });
const transferSchema = Joi.object({ userId: Joi.number().integer().positive().required() });
const environmentStatusSchema = Joi.object({ suspended: Joi.boolean().required() });
const cpfAccessParamsSchema = Joi.object({
  type: Joi.string().valid('seller', 'environment').required(),
  id: Joi.number().integer().positive().required(),
});

module.exports = {
  decisionSchema,
  cpfAccessParamsSchema,
  enabledSchema,
  environmentStatusSchema,
  environmentApplicationSchema,
  membershipDecisionSchema,
  sellerApplicationSchema,
  transferSchema,
};
