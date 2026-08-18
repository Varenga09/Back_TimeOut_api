const CategoryRepository = require('../repositories/CategoryRepository');
const AppError = require('../utils/AppError');

class CategoryService {
  async create(data) {
    return CategoryRepository.create(data);
  }

  async getAll() {
    return CategoryRepository.findAll();
  }

  async update(id, data) {
    const category = await CategoryRepository.update(id, data);
    if (!category) {
      throw new AppError('Categoria não encontrada', 404);
    }

    return category;
  }

  async delete(id) {
    const deleted = await CategoryRepository.delete(id);
    if (!deleted) {
      throw new AppError('Categoria não encontrada', 404);
    }

    return true;
  }
}

module.exports = new CategoryService();
