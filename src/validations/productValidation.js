const Joi = require('joi');
const { paginationSchema } = require('./commonValidation');

const flavorOptionSchema = Joi.object({
  name: Joi.string().trim().max(80).required(),
  priceAdjustment: Joi.number().precision(2).min(-9999).max(9999).default(0),
});

const flavorsSchema = Joi.alternatives()
  .try(
    Joi.array()
      .items(Joi.alternatives().try(Joi.string().trim().max(80), flavorOptionSchema))
      .max(20),
    Joi.string().trim().max(4000).allow('', null)
  )
  .optional();

const createProductSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),
  description: Joi.string().trim().allow('', null).optional(),
  flavors: flavorsSchema,
  price: Joi.number().precision(2).positive().required(),
  discountType: Joi.string().valid('percentage', 'fixed').allow('', null).optional(),
  discountValue: Joi.number().precision(2).min(0).allow(null).optional(),
  discountStartsAt: Joi.date().allow('', null).optional(),
  discountEndsAt: Joi.date().allow('', null).optional(),
  imageUrl: Joi.string().trim().max(255).allow('', null).optional(),
  imageGallery: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string().trim().max(255)).max(12),
      Joi.string().trim().max(4000).allow('', null)
    )
    .optional(),
  quantity: Joi.number().integer().min(0).default(0),
  isActive: Joi.boolean().default(true),
  categoryId: Joi.number().integer().positive().required(),
});

const updateProductSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120),
  description: Joi.string().trim().allow('', null),
  flavors: flavorsSchema,
  price: Joi.number().precision(2).positive(),
  discountType: Joi.string().valid('percentage', 'fixed').allow('', null),
  discountValue: Joi.number().precision(2).min(0).allow(null),
  discountStartsAt: Joi.date().allow('', null),
  discountEndsAt: Joi.date().allow('', null),
  imageUrl: Joi.string().trim().max(255).allow('', null),
  imageGallery: Joi.alternatives()
    .try(
      Joi.array().items(Joi.string().trim().max(255)).max(12),
      Joi.string().trim().max(4000).allow('', null)
    )
    .optional(),
  quantity: Joi.number().integer().min(0),
  isActive: Joi.boolean(),
  categoryId: Joi.number().integer().positive(),
})
  .min(1)
  .messages({
    'object.min': 'Informe pelo menos um campo para atualizar',
  });

const updateProductStatusSchema = Joi.object({
  isActive: Joi.boolean().required(),
});

const listProductsQuerySchema = Joi.object({
  ...paginationSchema,
  categoryId: Joi.number().integer().positive().optional(),
  sellerId: Joi.number().integer().positive().optional(),
  search: Joi.string().trim().max(120).empty('').optional(),
  minPrice: Joi.number().precision(2).min(0).optional(),
  maxPrice: Joi.number().precision(2).min(0).optional(),
});

module.exports = {
  createProductSchema,
  updateProductSchema,
  updateProductStatusSchema,
  listProductsQuerySchema,
};
