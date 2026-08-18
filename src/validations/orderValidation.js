const Joi = require('joi');
const { paginationSchema } = require('./commonValidation');

const orderStatusValues = [
  'pending',
  'accepted',
  'preparing',
  'ready',
  'delivered',
  'canceled',
  'refused',
];

const createOrderSchema = Joi.object({
  sellerId: Joi.number().integer().positive().required(),
  paymentMethod: Joi.string()
    .valid('cash', 'pix', 'credit_card', 'debit_card', 'card_in_person', 'arrange_with_seller')
    .required(),
  deliveryType: Joi.string().valid('pickup', 'internal_delivery', 'meeting_point').required(),
  deliveryLocation: Joi.string().trim().max(120).allow('', null).optional(),
  observation: Joi.string().trim().allow('', null).optional(),
  couponCode: Joi.string().trim().uppercase().max(40).allow('', null).optional(),
  items: Joi.array()
    .items(
      Joi.object({
        productId: Joi.number().integer().positive().required(),
        selectedFlavor: Joi.string().trim().max(120).allow('', null).optional(),
        quantity: Joi.number().integer().min(1).required(),
      })
    )
    .min(1)
    .required(),
});

const updateOrderStatusSchema = Joi.object({
  status: Joi.string().valid('accepted', 'preparing', 'ready', 'delivered', 'refused').required(),
});

const listOrdersQuerySchema = Joi.object({
  ...paginationSchema,
  status: Joi.string().valid(...orderStatusValues).empty('').optional(),
});

module.exports = {
  createOrderSchema,
  updateOrderStatusSchema,
  listOrdersQuerySchema,
};
