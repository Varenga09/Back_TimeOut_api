const crypto = require('crypto');

function generateEmailCode() {
  const localCode = process.env.LOCAL_VERIFICATION_CODE;
  if (
    process.env.NODE_ENV !== 'production' &&
    localCode &&
    /^\d{6}$/.test(localCode)
  ) {
    return localCode;
  }

  return String(crypto.randomInt(100000, 1000000));
}

function getEmailCodeExpiresAt() {
  return new Date(Date.now() + 15 * 60 * 1000);
}

function hashSecurityCode(code) {
  const secret = process.env.JWT_SECRET || 'local-development-code-secret';
  return crypto.createHmac('sha256', secret).update(String(code)).digest('hex');
}

function securityCodesMatch(code, storedValue) {
  if (!storedValue) return false;

  const candidate = hashSecurityCode(code);
  const stored = String(storedValue);

  if (stored.length === 64) {
    return crypto.timingSafeEqual(Buffer.from(candidate), Buffer.from(stored));
  }

  // Compatibility for verification codes created before hashed storage.
  const rawCandidate = Buffer.from(String(code));
  const rawStored = Buffer.from(stored);
  return rawCandidate.length === rawStored.length &&
    crypto.timingSafeEqual(rawCandidate, rawStored);
}

function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '');
}

function isValidBrazilPhone(value) {
  const digits = onlyDigits(value);
  const localNumber = digits.startsWith('55') && digits.length > 11
    ? digits.slice(2)
    : digits;

  if (![10, 11].includes(localNumber.length) || /^(\d)\1+$/.test(localNumber)) {
    return false;
  }

  const ddd = Number(localNumber.slice(0, 2));
  return ddd >= 11 && ddd <= 99;
}

function isValidCpf(value) {
  const cpf = onlyDigits(value);

  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) {
    return false;
  }

  const calculateDigit = (base) => {
    let sum = 0;
    for (let index = 0; index < base.length; index += 1) {
      sum += Number(base[index]) * (base.length + 1 - index);
    }

    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  const firstDigit = calculateDigit(cpf.slice(0, 9));
  const secondDigit = calculateDigit(cpf.slice(0, 10));

  return firstDigit === Number(cpf[9]) && secondDigit === Number(cpf[10]);
}

module.exports = {
  generateEmailCode,
  getEmailCodeExpiresAt,
  hashSecurityCode,
  isValidBrazilPhone,
  isValidCpf,
  onlyDigits,
  securityCodesMatch,
};
