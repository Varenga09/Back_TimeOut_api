const { Router } = require('express');
const AccessController = require('../controllers/AccessController');
const authMiddleware = require('../middlewares/authMiddleware');
const emailVerifiedMiddleware = require('../middlewares/emailVerifiedMiddleware');
const documentUpload = require('../config/documentUpload');
const { validateMiddleware } = require('../middlewares/validateMiddleware');
const { idParamSchema } = require('../validations/commonValidation');
const {
  decisionSchema,
  cpfAccessParamsSchema,
  enabledSchema,
  environmentApplicationSchema,
  environmentStatusSchema,
  membershipDecisionSchema,
  sellerApplicationSchema,
  transferSchema,
} = require('../validations/accessValidation');

const router = Router();
router.use(authMiddleware);
router.use(emailVerifiedMiddleware);

router.get('/me/applications', AccessController.mine);
router.post('/seller-applications', validateMiddleware(sellerApplicationSchema), AccessController.sellerApply);
router.post('/environment-applications', documentUpload.single('document'), validateMiddleware(environmentApplicationSchema), AccessController.environmentApply);
router.get('/notifications', AccessController.notifications);
router.patch('/notifications/:id/read', validateMiddleware(idParamSchema, 'params'), AccessController.readNotification);

router.get('/environment-admin', AccessController.environmentDashboard);
router.patch('/environment-admin/seller-applications/:id', validateMiddleware(idParamSchema, 'params'), validateMiddleware(decisionSchema), AccessController.reviewSeller);
router.patch('/environment-admin/memberships/:id', validateMiddleware(idParamSchema, 'params'), validateMiddleware(membershipDecisionSchema), AccessController.reviewMembership);
router.post('/environment-admin/access-code/rotate', AccessController.rotateCode);
router.patch('/environment-admin/access-code', validateMiddleware(enabledSchema), AccessController.codeEnabled);

router.get('/platform', AccessController.platformDashboard);
router.patch('/platform/environment-applications/:id', validateMiddleware(idParamSchema, 'params'), validateMiddleware(decisionSchema), AccessController.reviewEnvironment);
router.patch('/platform/environments/:id/status', validateMiddleware(idParamSchema, 'params'), validateMiddleware(environmentStatusSchema), AccessController.suspendEnvironment);
router.patch('/platform/environments/:id/transfer', validateMiddleware(idParamSchema, 'params'), validateMiddleware(transferSchema), AccessController.transferEnvironment);
router.patch('/platform/administrators/:id/status', validateMiddleware(idParamSchema, 'params'), validateMiddleware(environmentStatusSchema), AccessController.suspendAdministrator);
router.get('/platform/environment-applications/:id/document', validateMiddleware(idParamSchema, 'params'), AccessController.environmentDocument);
router.get('/applications/:type/:id/cpf', validateMiddleware(cpfAccessParamsSchema, 'params'), AccessController.revealCpf);

module.exports = router;
