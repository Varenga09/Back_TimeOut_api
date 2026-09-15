const { Router } = require('express');
const UserController = require('../controllers/UserController');
const upload = require('../config/upload');
const authMiddleware = require('../middlewares/authMiddleware');
const emailVerifiedMiddleware = require('../middlewares/emailVerifiedMiddleware');
const { validateMiddleware } = require('../middlewares/validateMiddleware');
const { idParamSchema } = require('../validations/commonValidation');
const { listUsersQuerySchema, updateUserSchema, becomeAdminSchema } = require('../validations/userValidation');
const { privilegeLimiter } = require('../middlewares/rateLimiters');

const router = Router();

router.use(authMiddleware);
router.use(emailVerifiedMiddleware);

router.get('/', validateMiddleware(listUsersQuerySchema, 'query'), UserController.getAll);
router.patch('/me/admin', privilegeLimiter, validateMiddleware(becomeAdminSchema), UserController.becomeAdmin);
router.get('/:id', validateMiddleware(idParamSchema, 'params'), UserController.getById);
router.put(
  '/:id',
  validateMiddleware(idParamSchema, 'params'),
  upload.single('profileImage'),
  validateMiddleware(updateUserSchema),
  UserController.update
);
router.delete('/:id', validateMiddleware(idParamSchema, 'params'), UserController.delete);

module.exports = router;
