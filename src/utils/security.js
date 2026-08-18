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

function onlyDigits(value = '') {
  return String(value).replace(/\D/g, '');
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
  isValidCpf,
  onlyDigits,
};
