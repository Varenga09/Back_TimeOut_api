const { Category } = require('../models');

class CategoryRepository {
  async create(data) {
    return Category.create(data);
  }

  async findAll() {
    return Category.findAll({ order: [['name', 'ASC']] });
  }

  async findById(id) {
    return Category.findByPk(id);
  }

  async update(id, data) {
    const category = await Category.findByPk(id);
    if (!category) return null;

    await category.update(data);
    return category;
  }

  async delete(id) {
    const category = await Category.findByPk(id);
    if (!category) return false;

    await category.destroy();
    return true;
  }
}

module.exports = new CategoryRepository();
