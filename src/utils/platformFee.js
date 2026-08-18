const platformFeeRules = [
  { max: 10, rate: 8 },
  { max: 50, rate: 10 },
  { max: Infinity, rate: 12 },
];

function calculatePlatformFee(totalPrice) {
  const total = Number(totalPrice || 0);
  const safeTotal = Number(Math.max(0, total).toFixed(2));
  const rule = platformFeeRules.find((item) => safeTotal <= item.max) ||
    platformFeeRules[platformFeeRules.length - 1];
  const amount = Number((safeTotal * (rule.rate / 100)).toFixed(2));

  return {
    rate: rule.rate,
    amount,
    sellerNetAmount: Number(Math.max(0, safeTotal - amount).toFixed(2)),
  };
}

module.exports = {
  calculatePlatformFee,
  platformFeeRules,
};
