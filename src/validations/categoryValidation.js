const Joi = require('joi');

const categorySchema = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
});

module.exports = { categorySchema };
