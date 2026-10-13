const test = require('node:test');
const assert = require('node:assert/strict');
const ProductService = require('./ProductService');
const CategoryRepository = require('../repositories/CategoryRepository');
const ProductRepository = require('../repositories/ProductRepository');
const OrderService = require('./OrderService');

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

test('flavor photos stay attached to stable option IDs, independently of the general gallery', async () => {
  const service = ProductService;
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const webp = Buffer.from('RIFFxxxxWEBP', 'ascii');
  const orange = '11111111-1111-4111-8111-111111111111';
  const passion = '22222222-2222-4222-8222-222222222222';
  const options = [{ id: orange, name: 'Laranja', priceAdjustment: 0 }, { id: passion, name: 'Maracujá', priceAdjustment: 2 }];
  const created = service.attachFlavorImages(options, [], JSON.stringify([passion, orange]), {
    flavorImages: [{ filename: 'maracuja.jpg', mimetype: 'image/jpeg', buffer: jpeg }, { filename: 'laranja.jpg', mimetype: 'image/jpeg', buffer: jpeg }],
  });
  assert.deepEqual(created.map(({ id, imageUrl, priceAdjustment }) => ({ id, imageUrl, priceAdjustment })), [
    { id: orange, imageUrl: '/uploads/laranja.jpg', priceAdjustment: 0 },
    { id: passion, imageUrl: '/uploads/maracuja.jpg', priceAdjustment: 2 },
  ]);
  const changed = service.attachFlavorImages(
    [{ id: passion, name: 'Maracujá', priceAdjustment: 3 }, { id: orange, name: 'Laranja', priceAdjustment: 0, removeImage: true }],
    created,
    JSON.stringify([passion]),
    { flavorImages: [{ filename: 'maracuja-nova.webp', mimetype: 'image/webp', buffer: webp }] }
  );
  assert.equal(changed[0].imageUrl, '/uploads/maracuja-nova.webp');
  assert.equal(changed[1].imageUrl, null);
  assert.equal(changed[0].priceAdjustment, 3);
  assert.deepEqual(service.attachFlavorImages([{ id: orange, name: 'Laranja', priceAdjustment: 0 }], [], null, null)[0].imageUrl, null);
  assert.throws(() => service.attachFlavorImages(options, [], JSON.stringify(['33333333-3333-4333-8333-333333333333']), {
    flavorImages: [{ filename: 'foreign.jpg', mimetype: 'image/jpeg', buffer: jpeg }],
  }), /opção inexistente/);
  assert.throws(() => service.attachFlavorImages(options, [], JSON.stringify([orange]), {
    flavorImages: [{ filename: 'fake.jpg', mimetype: 'image/jpeg', buffer: Buffer.from('<svg />') }],
  }), /JPG, PNG ou WebP válido/);
});

test('a different seller cannot change another product flavor photo', async () => {
  const originalFind = ProductRepository.findById;
  ProductRepository.findById = async () => ({ id: 9, userId: 7, environmentId: 2, flavors: [] });
  try {
    await assert.rejects(
      ProductService.update(9, { flavors: [{ name: 'Laranja' }] }, { id: 8, role: 'seller', environmentId: 2 }, {
        flavorImages: [{ filename: 'foreign.jpg' }],
      }),
      /só pode alterar seus próprios produtos/
    );
  } finally {
    ProductRepository.findById = originalFind;
  }
});

test('order resolves only the chosen flavor price and image from its product', () => {
  const product = {
    name: 'Suco',
    imageUrl: '/uploads/suco.jpg',
    flavors: [
      { name: 'Laranja', priceAdjustment: 0, imageUrl: '/uploads/laranja.jpg' },
      { name: 'Maracujá', priceAdjustment: 2, imageUrl: '/uploads/maracuja.jpg' },
      { name: 'Uva', priceAdjustment: 1 },
    ],
  };
  const passion = OrderService.resolveSelectedOption(product, 'Maracujá');
  assert.deepEqual(passion, { name: 'Maracujá', priceAdjustment: 2, imageUrl: '/uploads/maracuja.jpg' });
  assert.equal(OrderService.resolveSelectedOption(product, 'Uva').imageUrl, null);
  assert.equal(OrderService.resolveSelectedOption(product, null).imageUrl, '/uploads/suco.jpg');
});
