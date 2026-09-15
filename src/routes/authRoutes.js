const { Router } = require('express');
const AuthController = require('../controllers/AuthController');
const authMiddleware = require('../middlewares/authMiddleware');
const { validateMiddleware } = require('../middlewares/validateMiddleware');
const {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  resendVerificationSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} = require('../validations/authValidation');
const {
  loginLimiter,
  passwordRecoveryLimiter,
  registerLimiter,
  resendLimiter,
  verificationLimiter,
} = require('../middlewares/rateLimiters');

const router = Router();

router.post('/register', registerLimiter, validateMiddleware(registerSchema), AuthController.register);
router.post('/login', loginLimiter, validateMiddleware(loginSchema), AuthController.login);
router.post('/password/forgot', passwordRecoveryLimiter, validateMiddleware(forgotPasswordSchema), AuthController.forgotPassword);
router.post('/password/reset', passwordRecoveryLimiter, validateMiddleware(resetPasswordSchema), AuthController.resetPassword);
router.get('/me', authMiddleware, AuthController.me);
router.post('/verify-email', verificationLimiter, authMiddleware, validateMiddleware(verifyEmailSchema), AuthController.verifyEmail);
router.post('/resend-verification', resendLimiter, authMiddleware, validateMiddleware(resendVerificationSchema), AuthController.resendVerification);

module.exports = router;
