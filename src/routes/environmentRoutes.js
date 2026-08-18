const { Router } = require('express');
const EnvironmentController = require('../controllers/EnvironmentController');
const authMiddleware = require('../middlewares/authMiddleware');
const emailVerifiedMiddleware = require('../middlewares/emailVerifiedMiddleware');
const { validateMiddleware } = require('../middlewares/validateMiddleware');
const { idParamSchema } = require('../validations/commonValidation');
const {
  createEnvironmentSchema,
  joinEnvironmentSchema,
  listEnvironmentsQuerySchema,
} = require('../validations/environmentValidation');

const router = Router();

router.use(authMiddleware);
router.use(emailVerifiedMiddleware);

router.post('/', validateMiddleware(createEnvironmentSchema), EnvironmentController.create);
router.get('/', validateMiddleware(listEnvironmentsQuerySchema, 'query'), EnvironmentController.getAll);
router.post('/join', validateMiddleware(joinEnvironmentSchema), EnvironmentController.join);
router.get('/:id', validateMiddleware(idParamSchema, 'params'), EnvironmentController.getById);
router.patch('/:id/switch', validateMiddleware(idParamSchema, 'params'), EnvironmentController.switch);
router.get(
  '/:id/users',
  validateMiddleware(idParamSchema, 'params'),
  validateMiddleware(listEnvironmentsQuerySchema, 'query'),
  EnvironmentController.listUsers
);

module.exports = router;
