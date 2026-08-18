const CategoryService = require('../services/CategoryService');
const { successResponse } = require('../utils/response');

class CategoryController {
  async create(req, res, next) {
    try {
      const category = await CategoryService.create(req.body);
      return successResponse(res, { category }, 'Categoria criada com sucesso', 201);
    } catch (error) {
      return next(error);
    }
  }

  async getAll(req, res, next) {
    try {
      const categories = await CategoryService.getAll();
      return successResponse(res, { categories }, 'Categorias listadas com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async update(req, res, next) {
    try {
      const category = await CategoryService.update(req.params.id, req.body);
      return successResponse(res, { category }, 'Categoria atualizada com sucesso');
    } catch (error) {
      return next(error);
    }
  }

  async delete(req, res, next) {
    try {
      await CategoryService.delete(req.params.id);
      return successResponse(res, null, 'Categoria deletada com sucesso');
    } catch (error) {
      return next(error);
    }
  }
}

module.exports = new CategoryController();
