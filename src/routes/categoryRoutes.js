const { Router } = require('express');
const CategoryController = require('../controllers/CategoryController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const emailVerifiedMiddleware = require('../middlewares/emailVerifiedMiddleware');
const { validateMiddleware } = require('../middlewares/validateMiddleware');
const { idParamSchema } = require('../validations/commonValidation');
const { categorySchema } = require('../validations/categoryValidation');

const router = Router();

router.use(authMiddleware);
router.use(emailVerifiedMiddleware);

router.post('/', roleMiddleware('admin'), validateMiddleware(categorySchema), CategoryController.create);
router.get('/', CategoryController.getAll);
router.put(
  '/:id',
  roleMiddleware('admin'),
  validateMiddleware(idParamSchema, 'params'),
  validateMiddleware(categorySchema),
  CategoryController.update
);
router.delete(
  '/:id',
  roleMiddleware('admin'),
  validateMiddleware(idParamSchema, 'params'),
  CategoryController.delete
);

module.exports = router;
