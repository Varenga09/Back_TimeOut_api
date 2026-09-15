const { rateLimit } = require('express-rate-limit');

function createLimiter({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({
      success: false,
      message,
      error: { code: 'RATE_LIMITED' },
    }),
  });
}

const loginLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.',
});

const registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  message: 'Muitos cadastros realizados. Aguarde antes de tentar novamente.',
});

const verificationLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: 'Muitas tentativas de confirmação. Aguarde 15 minutos.',
});

const resendLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  message: 'Muitos códigos solicitados. Aguarde 15 minutos.',
});

const passwordRecoveryLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: 'Muitas solicitações de recuperação. Aguarde antes de tentar novamente.',
});

const privilegeLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  message: 'Muitas tentativas de ativação. Aguarde antes de tentar novamente.',
});

module.exports = {
  loginLimiter,
  passwordRecoveryLimiter,
  privilegeLimiter,
  registerLimiter,
  resendLimiter,
  verificationLimiter,
};
