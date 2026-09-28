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

function calculateCommission(grossAmount, rate) {
  const grossCents = Math.max(0, Math.round(Number(grossAmount || 0) * 100));
  const safeRate = Number(Math.min(100, Math.max(0, Number(rate || 0))).toFixed(2));
  const rateBasisPoints = Math.round(safeRate * 100);
  const feeCents = Math.round((grossCents * rateBasisPoints) / 10000);
  return {
    rate: safeRate,
    amount: feeCents / 100,
    sellerNetAmount: (grossCents - feeCents) / 100,
  };
}

module.exports = {
  calculatePlatformFee,
  platformFeeRules,
  calculateCommission,
};
