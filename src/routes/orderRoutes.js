const { Router } = require('express');
const OrderController = require('../controllers/OrderController');
const authMiddleware = require('../middlewares/authMiddleware');
const emailVerifiedMiddleware = require('../middlewares/emailVerifiedMiddleware');
const { validateMiddleware } = require('../middlewares/validateMiddleware');
const { idParamSchema } = require('../validations/commonValidation');
const {
  createOrderSchema,
  updateOrderStatusSchema,
  listOrdersQuerySchema,
} = require('../validations/orderValidation');

const router = Router();

router.use(authMiddleware);
router.use(emailVerifiedMiddleware);

router.post('/', validateMiddleware(createOrderSchema), OrderController.create);
router.get('/my-orders', validateMiddleware(listOrdersQuerySchema, 'query'), OrderController.myOrders);
router.get('/seller-orders', validateMiddleware(listOrdersQuerySchema, 'query'), OrderController.sellerOrders);
router.get('/:id', validateMiddleware(idParamSchema, 'params'), OrderController.getById);
router.patch(
  '/:id/status',
  validateMiddleware(idParamSchema, 'params'),
  validateMiddleware(updateOrderStatusSchema),
  OrderController.updateStatus
);
router.patch('/:id/cancel', validateMiddleware(idParamSchema, 'params'), OrderController.cancel);

module.exports = router;
