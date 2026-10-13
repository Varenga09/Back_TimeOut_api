const test = require('node:test');
const assert = require('node:assert/strict');
const ProductService = require('./ProductService');
const CategoryRepository = require('../repositories/CategoryRepository');
const ProductRepository = require('../repositories/ProductRepository');

test('seller creates separate galleries for products in the same environment', async () => {
  const originalCategory = CategoryRepository.findById;
  const originalCreate = ProductRepository.create;
  const created = [];
  CategoryRepository.findById = async () => ({ id: 3 });
  ProductRepository.create = async (values) => { created.push(values); return values; };

  try {
    const seller = { id: 7, role: 'seller', environmentId: 2 };
    await ProductService.create(
      { name: 'Suco', categoryId: 3, price: 5, imageGallery: ['/uploads/suco-extra.jpg'] },
      seller,
      { image: [{ filename: 'suco-main.jpg' }], images: [{ filename: 'suco-upload.jpg' }] }
    );
    await ProductService.create(
      { name: 'Coxinha', categoryId: 3, price: 7, imageGallery: [] },
      seller,
      { image: [{ filename: 'coxinha-main.jpg' }], images: [{ filename: 'coxinha-upload.jpg' }] }
    );

    assert.deepEqual(created.map(({ imageUrl, imageGallery }) => ({ imageUrl, imageGallery })), [
      { imageUrl: '/uploads/suco-main.jpg', imageGallery: ['/uploads/suco-extra.jpg', '/uploads/suco-upload.jpg'] },
      { imageUrl: '/uploads/coxinha-main.jpg', imageGallery: ['/uploads/coxinha-upload.jpg'] },
    ]);
    assert.ok(created.every(({ userId, environmentId }) => userId === 7 && environmentId === 2));
  } finally {
    CategoryRepository.findById = originalCategory;
    ProductRepository.create = originalCreate;
  }
});

test('editing a product preserves only its own existing photos and new uploads', async () => {
  const originalFind = ProductRepository.findById;
  const originalUpdate = ProductRepository.update;
  const updates = [];
  const products = {
    1: { id: 1, userId: 7, environmentId: 2, imageGallery: ['/uploads/suco-extra.jpg'] },
    2: { id: 2, userId: 7, environmentId: 2, imageGallery: ['/uploads/coxinha-extra.jpg'] },
  };
  ProductRepository.findById = async (id) => products[id];
  ProductRepository.update = async (id, values) => { updates.push({ id, values }); return values; };

  try {
    const seller = { id: 7, role: 'seller', environmentId: 2 };
    await ProductService.update(2, { description: 'Receita atualizada' }, seller, {
      images: [{ filename: 'coxinha-nova.jpg' }],
    });
    await ProductService.update(1, { imageGallery: ['/uploads/suco-extra.jpg', '/uploads/suco-vendedor.jpg'] }, seller);

    assert.deepEqual(updates, [
      { id: 2, values: { description: 'Receita atualizada', imageGallery: ['/uploads/coxinha-extra.jpg', '/uploads/coxinha-nova.jpg'] } },
      { id: 1, values: { imageGallery: ['/uploads/suco-extra.jpg', '/uploads/suco-vendedor.jpg'] } },
    ]);
  } finally {
    ProductRepository.findById = originalFind;
    ProductRepository.update = originalUpdate;
  }
});
