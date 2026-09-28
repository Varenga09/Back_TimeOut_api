const AppError = require('./AppError');

const finalizedStatuses = new Set(['declined', 'settled', 'refunded']);

function isIdempotentMockTransition(currentStatus, action) {
  return (
    (action === 'approve' && currentStatus === 'held') ||
    (action === 'pending' && currentStatus === 'pending') ||
    (action === 'decline' && currentStatus === 'declined') ||
    (action === 'settle' && currentStatus === 'settled') ||
    (action === 'refund' && currentStatus === 'refunded')
  );
}

function resolveMockTransition(currentStatus, action) {
  if (action === 'settle') {
    if (currentStatus === 'settled') return 'settled';
    if (currentStatus !== 'held') throw new AppError('O pagamento precisa estar reservado antes da entrega', 400);
    return 'settled';
  }

  if (action === 'refund') {
    if (currentStatus === 'refunded') return 'refunded';
    if (currentStatus === 'settled') throw new AppError('Pedido liquidado exige ajuste excepcional auditado', 409);
    return 'refunded';
  }

  if (isIdempotentMockTransition(currentStatus, action)) return currentStatus;

  if (finalizedStatuses.has(currentStatus)) {
    throw new AppError('Esta transação financeira já foi finalizada', 409);
  }

  if (action === 'approve') {
    if (currentStatus !== 'pending') throw new AppError('Pagamento não pode mais ser aprovado', 409);
    return 'held';
  }
  if (action === 'pending') {
    if (currentStatus === 'held') throw new AppError('Pagamento reservado não pode voltar para pendente', 409);
    return 'pending';
  }
  if (action === 'decline') {
    if (currentStatus === 'held') throw new AppError('Pagamento reservado não pode ser recusado', 409);
    return 'declined';
  }

  throw new AppError('Transição financeira inválida', 400);
}

module.exports = { isIdempotentMockTransition, resolveMockTransition };
