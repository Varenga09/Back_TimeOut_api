const { Router } = require('express');
const AccessController = require('../controllers/AccessController');
const AccountAdministrationController = require('../controllers/AccountAdministrationController');
const authMiddleware = require('../middlewares/authMiddleware');
const emailVerifiedMiddleware = require('../middlewares/emailVerifiedMiddleware');
const approvedMembershipMiddleware = require('../middlewares/approvedMembershipMiddleware');
const { isPlatformAdmin } = require('../utils/permissions');
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
  sensitiveAccessSchema,
  accountListSchema,
  accountProfileSchema,
  accountStatusSchema,
  platformDashboardQuerySchema,
} = require('../validations/accessValidation');

const router = Router();
const accountScopeMiddleware = (req, res, next) => isPlatformAdmin(req.user) ? next() : approvedMembershipMiddleware(req, res, next);
router.use(authMiddleware);
router.use(emailVerifiedMiddleware);

router.get('/me/applications', AccessController.mine);
router.post('/seller-applications', approvedMembershipMiddleware, documentUpload.single('document'), validateMiddleware(sellerApplicationSchema), AccessController.sellerApply);
router.post('/environment-applications', documentUpload.single('document'), validateMiddleware(environmentApplicationSchema), AccessController.environmentApply);
router.get('/notifications', AccessController.notifications);
router.patch('/notifications/:id/read', validateMiddleware(idParamSchema, 'params'), AccessController.readNotification);

router.get('/environment-admin', approvedMembershipMiddleware, AccessController.environmentDashboard);
router.get('/environment-admin/sellers/:id/regularity', approvedMembershipMiddleware, validateMiddleware(idParamSchema, 'params'), AccessController.sellerRegularity);
router.get('/environment-admin/seller-applications/:id/document', approvedMembershipMiddleware, validateMiddleware(idParamSchema, 'params'), validateMiddleware(sensitiveAccessSchema, 'query'), AccessController.sellerDocument);
router.patch('/environment-admin/seller-applications/:id', approvedMembershipMiddleware, validateMiddleware(idParamSchema, 'params'), validateMiddleware(decisionSchema), AccessController.reviewSeller);
router.patch('/environment-admin/memberships/:id', approvedMembershipMiddleware, validateMiddleware(idParamSchema, 'params'), validateMiddleware(membershipDecisionSchema), AccessController.reviewMembership);
router.post('/environment-admin/access-code/rotate', approvedMembershipMiddleware, AccessController.rotateCode);
router.patch('/environment-admin/access-code', approvedMembershipMiddleware, validateMiddleware(enabledSchema), AccessController.codeEnabled);

router.get('/platform', validateMiddleware(platformDashboardQuerySchema, 'query'), AccessController.platformDashboard);
router.get('/platform/environment-applications/:id', validateMiddleware(idParamSchema, 'params'), AccessController.environmentApplicationDetail);
router.get('/platform/sellers/:id/regularity', validateMiddleware(idParamSchema, 'params'), AccessController.sellerRegularity);
router.get('/platform/seller-applications/:id/document', validateMiddleware(idParamSchema, 'params'), validateMiddleware(sensitiveAccessSchema, 'query'), AccessController.sellerDocument);
router.get('/admin/accounts', accountScopeMiddleware, validateMiddleware(accountListSchema, 'query'), AccountAdministrationController.list);
router.get('/admin/accounts/:id', accountScopeMiddleware, validateMiddleware(idParamSchema, 'params'), AccountAdministrationController.detail);
router.patch('/admin/accounts/:id/profile', accountScopeMiddleware, validateMiddleware(idParamSchema, 'params'), validateMiddleware(accountProfileSchema), AccountAdministrationController.profile);
router.patch('/admin/accounts/:id/status', accountScopeMiddleware, validateMiddleware(idParamSchema, 'params'), validateMiddleware(accountStatusSchema), AccountAdministrationController.status);
router.post('/admin/accounts/:id/sessions/invalidate', accountScopeMiddleware, validateMiddleware(idParamSchema, 'params'), validateMiddleware(sensitiveAccessSchema), AccountAdministrationController.sessions);
router.post('/admin/accounts/:id/email/reverify', accountScopeMiddleware, validateMiddleware(idParamSchema, 'params'), validateMiddleware(sensitiveAccessSchema), AccountAdministrationController.email);
router.patch('/platform/environment-applications/:id', validateMiddleware(idParamSchema, 'params'), validateMiddleware(decisionSchema), AccessController.reviewEnvironment);
router.patch('/platform/environments/:id/status', validateMiddleware(idParamSchema, 'params'), validateMiddleware(environmentStatusSchema), AccessController.suspendEnvironment);
router.patch('/platform/environments/:id/transfer', validateMiddleware(idParamSchema, 'params'), validateMiddleware(transferSchema), AccessController.transferEnvironment);
router.patch('/platform/administrators/:id/status', validateMiddleware(idParamSchema, 'params'), validateMiddleware(environmentStatusSchema), AccessController.suspendAdministrator);
router.get('/platform/environment-applications/:id/document', validateMiddleware(idParamSchema, 'params'), validateMiddleware(sensitiveAccessSchema, 'query'), AccessController.environmentDocument);
router.get('/applications/:type/:id/cpf', validateMiddleware(cpfAccessParamsSchema, 'params'), validateMiddleware(sensitiveAccessSchema, 'query'), AccessController.revealCpf);

module.exports = router;
