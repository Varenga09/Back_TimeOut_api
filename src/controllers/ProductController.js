const ProductService = require('../services/ProductService');
const { successResponse } = require('../utils/response');

class ProductController {
  async create(req, res, next) {
    try {
      const product = await ProductService.create(req.body, req.user, req.files);
      return successResponse(res, { product }, 'Produto criado com sucesso', 201);
    } catch (error) {
      return next(error);
    }
  }

  async getAll(req, res, next) {
    try {
      const result = await ProductService.getAll(req.query, req.user);
      return successResponse(res, result, 'Produtos listados com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async getById(req, res, next) {
    try {
      const product = await ProductService.getById(req.params.id, req.user);
      return successResponse(res, { product }, 'Produto encontrado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async update(req, res, next) {
    try {
      const product = await ProductService.update(req.params.id, req.body, req.user, req.files);
      return successResponse(res, { product }, 'Produto atualizado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async delete(req, res, next) {
    try {
      await ProductService.delete(req.params.id, req.user);
      return successResponse(res, null, 'Produto removido com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async updateStatus(req, res, next) {
    try {
      const product = await ProductService.updateStatus(req.params.id, req.body.isActive, req.user);
      return successResponse(res, { product }, 'Status do produto atualizado com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async getReviews(req, res, next) {
    try {
      const result = await ProductService.getReviews(req.params.id, req.user);
      return successResponse(res, result, 'Avaliações listadas com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async saveReview(req, res, next) {
    try {
      const result = await ProductService.saveReview(req.params.id, req.body, req.user);
      return successResponse(res, result, 'Avaliação salva com sucesso', 201);
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new ProductController();
