const { Router } = require('express');
const CouponController = require('../controllers/CouponController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const emailVerifiedMiddleware = require('../middlewares/emailVerifiedMiddleware');
const { validateMiddleware } = require('../middlewares/validateMiddleware');
const { idParamSchema } = require('../validations/commonValidation');
const {
  createCouponSchema,
  updateCouponSchema,
  updateCouponStatusSchema,
  listCouponsQuerySchema,
} = require('../validations/couponValidation');

const router = Router();

router.use(authMiddleware);
router.use(emailVerifiedMiddleware);
router.use(roleMiddleware('seller', 'admin'));

router.post('/', validateMiddleware(createCouponSchema), CouponController.create);
router.get('/', validateMiddleware(listCouponsQuerySchema, 'query'), CouponController.getAll);
router.put('/:id', validateMiddleware(idParamSchema, 'params'), validateMiddleware(updateCouponSchema), CouponController.update);
router.patch('/:id/status', validateMiddleware(idParamSchema, 'params'), validateMiddleware(updateCouponStatusSchema), CouponController.updateStatus);
router.delete('/:id', validateMiddleware(idParamSchema, 'params'), CouponController.delete);

module.exports = router;
