const { Router } = require('express');
const PaymentController = require('../controllers/PaymentController');
const authMiddleware = require('../middlewares/authMiddleware');
const emailVerifiedMiddleware = require('../middlewares/emailVerifiedMiddleware');
const { validateMiddleware } = require('../middlewares/validateMiddleware');
const { idParamSchema } = require('../validations/commonValidation');
const {
  updatePaymentSettingsSchema,
  sellerIdParamSchema,
  simulatePaymentSchema,
  connectPayoutAccountSchema,
  payoutStatusSchema,
} = require('../validations/paymentValidation');

const router = Router();

router.post('/webhooks/mercado-pago', PaymentController.mercadoPagoWebhook);
router.get('/webhooks/mercado-pago', PaymentController.mercadoPagoWebhook);

router.use(authMiddleware);
router.use(emailVerifiedMiddleware);

router.get('/settings', PaymentController.getMySettings);
router.put('/settings', validateMiddleware(updatePaymentSettingsSchema), PaymentController.updateMySettings);
router.get(
  '/settings/sellers/:sellerId',
  validateMiddleware(sellerIdParamSchema, 'params'),
  PaymentController.getSellerSettings
);
router.post('/orders/:id/retry', validateMiddleware(idParamSchema, 'params'), PaymentController.retryPayment);
router.post('/orders/:id/simulate', validateMiddleware(idParamSchema, 'params'), validateMiddleware(simulatePaymentSchema), PaymentController.simulate);
router.get('/payout-account', PaymentController.payoutOverview);
router.post('/payout-account/connect', validateMiddleware(connectPayoutAccountSchema), PaymentController.connectPayout);
router.get('/admin/overview', PaymentController.adminOverview);
router.patch('/admin/accounts/:sellerId/status', validateMiddleware(sellerIdParamSchema, 'params'), validateMiddleware(payoutStatusSchema), PaymentController.payoutStatus);
router.get('/platform/overview', PaymentController.platformOverview);

module.exports = router;
