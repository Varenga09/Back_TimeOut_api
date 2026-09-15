const { Router } = require('express');
const SellerController = require('../controllers/SellerController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const emailVerifiedMiddleware = require('../middlewares/emailVerifiedMiddleware');
const { validateMiddleware } = require('../middlewares/validateMiddleware');
const { idParamSchema } = require('../validations/commonValidation');
const { requestSellerSchema } = require('../validations/sellerValidation');
const { privilegeLimiter } = require('../middlewares/rateLimiters');

const router = Router();

router.use(authMiddleware);
router.use(emailVerifiedMiddleware);

router.post('/request', privilegeLimiter, validateMiddleware(requestSellerSchema), SellerController.requestProfile);
router.patch(
  '/:id/approve',
  roleMiddleware('admin'),
  validateMiddleware(idParamSchema, 'params'),
  SellerController.approve
);
router.patch(
  '/:id/block',
  roleMiddleware('admin'),
  validateMiddleware(idParamSchema, 'params'),
  SellerController.block
);

module.exports = router;
