const AppError = require('./AppError');

const finalizedStatuses = new Set(['settled', 'refunded']);

function resolveMockTransition(currentStatus, action) {
  if (action === 'settle') {
    if (currentStatus === 'settled') throw new AppError('Pagamento já liquidado', 409);
    if (currentStatus !== 'held') throw new AppError('O pagamento precisa estar reservado antes da entrega', 400);
    return 'settled';
  }

  if (action === 'refund') {
    if (currentStatus === 'refunded') throw new AppError('Pagamento já reembolsado', 409);
    if (currentStatus === 'settled') throw new AppError('Pedido liquidado exige ajuste excepcional auditado', 409);
    return 'refunded';
  }

  if (finalizedStatuses.has(currentStatus)) {
    throw new AppError('Esta transação financeira já foi finalizada', 409);
  }

  if (action === 'approve') return 'held';
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

module.exports = { resolveMockTransition };
