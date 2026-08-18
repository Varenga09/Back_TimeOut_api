const { Router } = require('express');
const ProductController = require('../controllers/ProductController');
const upload = require('../config/upload');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const emailVerifiedMiddleware = require('../middlewares/emailVerifiedMiddleware');
const { validateMiddleware } = require('../middlewares/validateMiddleware');
const { idParamSchema } = require('../validations/commonValidation');
const {
  createProductSchema,
  updateProductSchema,
  updateProductStatusSchema,
  listProductsQuerySchema,
} = require('../validations/productValidation');
const { productReviewSchema } = require('../validations/reviewValidation');

const router = Router();

router.use(authMiddleware);
router.use(emailVerifiedMiddleware);

router.post(
  '/',
  roleMiddleware('seller', 'admin'),
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'images', maxCount: 8 },
  ]),
  validateMiddleware(createProductSchema),
  ProductController.create
);
router.get('/', validateMiddleware(listProductsQuerySchema, 'query'), ProductController.getAll);
router.get('/:id/reviews', validateMiddleware(idParamSchema, 'params'), ProductController.getReviews);
router.post(
  '/:id/reviews',
  validateMiddleware(idParamSchema, 'params'),
  validateMiddleware(productReviewSchema),
  ProductController.saveReview
);
router.get('/:id', validateMiddleware(idParamSchema, 'params'), ProductController.getById);
router.put(
  '/:id',
  roleMiddleware('seller', 'admin'),
  validateMiddleware(idParamSchema, 'params'),
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'images', maxCount: 8 },
  ]),
  validateMiddleware(updateProductSchema),
  ProductController.update
);
router.delete(
  '/:id',
  roleMiddleware('seller', 'admin'),
  validateMiddleware(idParamSchema, 'params'),
  ProductController.delete
);
router.patch(
  '/:id/status',
  roleMiddleware('seller', 'admin'),
  validateMiddleware(idParamSchema, 'params'),
  validateMiddleware(updateProductStatusSchema),
  ProductController.updateStatus
);

module.exports = router;
