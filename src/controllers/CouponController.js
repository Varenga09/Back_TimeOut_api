const CouponService = require('../services/CouponService');
const { successResponse } = require('../utils/response');

class CouponController {
  async create(req, res, next) {
    try {
      const coupon = await CouponService.create(req.body, req.user);
      return successResponse(res, { coupon }, 'Cupom criado com sucesso', 201);
    } catch (error) {
      return next(error);
    }
  }

  async getAll(req, res, next) {
    try {
      const result = await CouponService.getAll(req.query, req.user);
      return successResponse(res, result, 'Cupons listados com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async update(req, res, next) {
    try {
      const coupon = await CouponService.update(req.params.id, req.body, req.user);
      return successResponse(res, { coupon }, 'Cupom atualizado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async updateStatus(req, res, next) {
    try {
      const coupon = await CouponService.updateStatus(req.params.id, req.body.isActive, req.user);
      return successResponse(res, { coupon }, 'Status do cupom atualizado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async delete(req, res, next) {
    try {
      await CouponService.delete(req.params.id, req.user);
      return successResponse(res, null, 'Cupom removido com sucesso');
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new CouponController();
