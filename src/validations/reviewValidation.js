const Joi = require('joi');

const productReviewSchema = Joi.object({
  rating: Joi.number().integer().min(1).max(5).required(),
  comment: Joi.string().trim().max(600).allow('', null).optional(),
});

module.exports = {
  productReviewSchema,
};
