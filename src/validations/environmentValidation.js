const Joi = require('joi');
const { paginationSchema } = require('./commonValidation');

const createEnvironmentSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  type: Joi.string().valid('school', 'company', 'factory', 'college', 'office', 'other').required(),
  address: Joi.string().trim().max(255).allow('', null).optional(),
});

const joinEnvironmentSchema = Joi.object({
  accessCode: Joi.string().trim().max(50).required(),
});

const listEnvironmentsQuerySchema = Joi.object({
  ...paginationSchema,
  role: Joi.string().valid('customer', 'seller', 'environment_admin').empty('').optional(),
  search: Joi.string().trim().max(120).empty('').optional(),
});

module.exports = {
  createEnvironmentSchema,
  joinEnvironmentSchema,
  listEnvironmentsQuerySchema,
};
