const { Router } = require('express');
const AuthController = require('../controllers/AuthController');
const authMiddleware = require('../middlewares/authMiddleware');
const { validateMiddleware } = require('../middlewares/validateMiddleware');
const {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
} = require('../validations/authValidation');

const router = Router();

router.post('/register', validateMiddleware(registerSchema), AuthController.register);
router.post('/login', validateMiddleware(loginSchema), AuthController.login);
router.get('/me', authMiddleware, AuthController.me);
router.post('/verify-email', authMiddleware, validateMiddleware(verifyEmailSchema), AuthController.verifyEmail);
router.post('/resend-verification', authMiddleware, validateMiddleware(resendVerificationSchema), AuthController.resendVerification);

module.exports = router;
