const { Router } = require('express');
const PlanController = require('../controllers/PlanController');
const authMiddleware = require('../middlewares/authMiddleware');
const emailVerifiedMiddleware = require('../middlewares/emailVerifiedMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const { validateMiddleware } = require('../middlewares/validateMiddleware');
const { idParamSchema } = require('../validations/commonValidation');
const { changePlanSchema, institutionalConfigSchema } = require('../validations/planValidation');

const router = Router();
router.use(authMiddleware);
router.use(emailVerifiedMiddleware);
router.get('/', PlanController.list);
router.get('/me', roleMiddleware('seller', 'admin'), PlanController.myOverview);
router.patch('/me', roleMiddleware('seller', 'admin'), validateMiddleware(changePlanSchema), PlanController.changeMine);
router.get('/admin/overview', roleMiddleware('admin', 'environment_admin'), PlanController.adminOverview);
router.patch('/admin/sellers/:id', roleMiddleware('admin', 'environment_admin'), validateMiddleware(idParamSchema, 'params'), validateMiddleware(changePlanSchema), PlanController.adminChange);
router.put('/admin/institutional', roleMiddleware('admin', 'environment_admin'), validateMiddleware(institutionalConfigSchema), PlanController.institutional);

module.exports = router;
