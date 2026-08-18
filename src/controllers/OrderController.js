const OrderService = require('../services/OrderService');
const { successResponse } = require('../utils/response');

class OrderController {
  async create(req, res, next) {
    try {
      const result = await OrderService.create(req.body, req.user);
      return successResponse(res, result, 'Pedido criado com sucesso', 201);
    } catch (error) {
      return next(error);
    }
  }

  async myOrders(req, res, next) {
    try {
      const result = await OrderService.getMyOrders(req.query, req.user);
      return successResponse(res, result, 'Pedidos do cliente listados com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async sellerOrders(req, res, next) {
    try {
      const result = await OrderService.getSellerOrders(req.query, req.user);
      return successResponse(res, result, 'Pedidos recebidos listados com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const order = await OrderService.getById(req.params.id, req.user);
      return successResponse(res, { order }, 'Pedido encontrado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async updateStatus(req, res, next) {
    try {
      const order = await OrderService.updateStatus(req.params.id, req.body.status, req.user);
      return successResponse(res, { order }, 'Status do pedido atualizado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async cancel(req, res, next) {
    try {
      const order = await OrderService.cancel(req.params.id, req.user);
      return successResponse(res, { order }, 'Pedido cancelado com sucesso');
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new OrderController();
