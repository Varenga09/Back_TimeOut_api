const CouponRepository = require('../repositories/CouponRepository');
const AppError = require('../utils/AppError');

function normalizeCouponData(data) {
  const normalized = {};

  if (Object.prototype.hasOwnProperty.call(data, 'code')) {
    normalized.code = data.code ? String(data.code).trim().toUpperCase() : undefined;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'description')) {
    normalized.description = data.description || null;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'discountType')) {
    normalized.discountType = data.discountType;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'discountValue')) {
    normalized.discountValue = data.discountValue;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'startsAt')) {
    normalized.startsAt = data.startsAt || null;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'endsAt')) {
    normalized.endsAt = data.endsAt || null;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'usageLimit')) {
    normalized.usageLimit = data.usageLimit || null;
  }

  if (Object.prototype.hasOwnProperty.call(data, 'isActive')) {
    normalized.isActive = data.isActive;
  }

  return normalized;
}

class CouponService {
  async create(data, requester) {
    if (!['seller', 'admin'].includes(requester.role)) {
      throw new AppError('Apenas vendedores podem criar cupons', 403);
    }

    const normalized = normalizeCouponData(data);
    this.validateDates(normalized);

    return CouponRepository.create({
      ...normalized,
      userId: requester.id,
      environmentId: requester.environmentId,
    });
  }

  async getAll(query, requester) {
    if (!['seller', 'admin'].includes(requester.role)) {
      throw new AppError('Apenas vendedores podem listar cupons', 403);
    }

    return CouponRepository.findAll({
      ...query,
      environmentId: requester.environmentId,
      ...(requester.role === 'seller' && { sellerId: requester.id }),
    });
  }

  async update(id, data, requester) {
    const coupon = await this.findOwnedCoupon(id, requester);
    const normalized = normalizeCouponData(data);
    this.validateDates(normalized);

    return CouponRepository.update(coupon.id, normalized);
  }

  async updateStatus(id, isActive, requester) {
    const coupon = await this.findOwnedCoupon(id, requester);
    return CouponRepository.update(coupon.id, { isActive });
  }

  async delete(id, requester) {
    const coupon = await this.findOwnedCoupon(id, requester);
    await CouponRepository.delete(coupon.id);
    return true;
  }

  async findOwnedCoupon(id, requester) {
    const coupon = await CouponRepository.findById(id);
    if (!coupon || Number(coupon.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Cupom não encontrado', 404);
    }

    if (requester.role !== 'admin' && Number(coupon.userId) !== Number(requester.id)) {
      throw new AppError('Você só pode alterar seus próprios cupons', 403);
    }

    return coupon;
  }

  validateDates(data) {
    if (data.discountType === 'percentage' && Number(data.discountValue) > 90) {
      throw new AppError('O desconto percentual não pode passar de 90%', 400);
    }

    if (data.startsAt && data.endsAt && new Date(data.startsAt) >= new Date(data.endsAt)) {
      throw new AppError('A data final do cupom deve ser maior que a data inicial', 400);
    }
  }
}

module.exports = new CouponService();
