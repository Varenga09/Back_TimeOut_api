const test = require('node:test');
const assert = require('node:assert/strict');
const ProductService = require('./ProductService');
const OrderService = require('./OrderService');
const CouponRepository = require('../repositories/CouponRepository');
const { createOrderSchema } = require('../validations/orderValidation');

const ids = {
  small: '11111111-1111-4111-8111-111111111111',
  medium: '22222222-2222-4222-8222-222222222222',
  large: '33333333-3333-4333-8333-333333333333',
  pacoca: '44444444-4444-4444-8444-444444444444',
  milk: '55555555-5555-4555-8555-555555555555',
  condensed: '66666666-6666-4666-8666-666666666666',
  foreign: '77777777-7777-4777-8777-777777777777',
};

const acai = () => ({
  id: 8,
  name: 'Açaí',
  price: '10.00',
  imageUrl: '/uploads/acai.jpg',
  sizeOptions: [
    { id: ids.small, name: '300 ml', price: 10, isActive: true },
    { id: ids.medium, name: '500 ml', price: 15, isActive: true, imageUrl: '/uploads/500.jpg' },
    { id: ids.large, name: '700 ml', price: 19, isActive: true },
  ],
  addons: [
    { id: ids.pacoca, name: 'Paçoca', price: 2, isActive: true },
    { id: ids.milk, name: 'Leite em pó', price: 3, isActive: true },
    { id: ids.condensed, name: 'Leite condensado', price: 4, isActive: true },
  ],
});

test('500 ml com dois adicionais custa 20 por unidade; três adicionais somam independentemente', () => {
  const product = acai();
  const item = OrderService.prepareItem(product, { selectedSizeId: ids.medium, selectedAddonIds: [ids.pacoca, ids.milk], quantity: 2 });
  assert.equal(item.unitPrice, 20);
  assert.equal(item.subtotal, 40);
  assert.equal(item.imageUrl, '/uploads/500.jpg');
  assert.deepEqual(item.optionsSnapshot.addons.map((addon) => addon.name), ['Paçoca', 'Leite em pó']);
  assert.equal(OrderService.prepareItem(product, { selectedSizeId: ids.medium, selectedAddonIds: [ids.pacoca, ids.milk, ids.condensed], quantity: 1 }).unitPrice, 24);
});

test('combinações diferentes ficam em linhas distintas, repetição aumenta a quantidade', () => {
  const grouped = OrderService.groupItems([
    { productId: 8, selectedSizeId: ids.small, selectedAddonIds: [ids.pacoca], quantity: 1 },
    { productId: 8, selectedSizeId: ids.medium, selectedAddonIds: [ids.milk], quantity: 1 },
    { productId: 8, selectedSizeId: ids.small, selectedAddonIds: [ids.pacoca], quantity: 2 },
  ]);
  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].quantity, 3);
  assert.equal(grouped[1].quantity, 1);
});

test('fotografia financeira permanece após editar o produto; legado continua sem adicionais', () => {
  const product = acai();
  const item = OrderService.prepareItem(product, { selectedSizeId: ids.medium, selectedAddonIds: [ids.pacoca], quantity: 1 });
  product.sizeOptions[1].price = 99;
  product.addons[0].price = 12;
  assert.deepEqual(item.optionsSnapshot.size, { id: ids.medium, name: '500 ml', price: 15, imageUrl: '/uploads/500.jpg' });
  assert.equal(item.optionsSnapshot.addons[0].price, 2);
  assert.equal(item.unitPrice, 17);
  const oldItem = OrderService.prepareItem({ id: 9, name: 'Suco', price: '5.00', flavors: ['Laranja'] }, { selectedFlavor: 'Laranja', selectedAddonIds: [], quantity: 1 });
  assert.equal(oldItem.unitPrice, 5);
  assert.equal(oldItem.optionsSnapshot.size, null);
});

test('rejeita tamanho ausente, opções inativas, estrangeiras e adicionais repetidos', () => {
  const product = acai();
  assert.throws(() => OrderService.prepareItem(product, { selectedAddonIds: [], quantity: 1 }), /Escolha um tamanho/);
  product.sizeOptions[1].isActive = false;
  assert.throws(() => OrderService.prepareItem(product, { selectedSizeId: ids.medium, selectedAddonIds: [], quantity: 1 }), /Escolha um tamanho/);
  assert.throws(() => OrderService.prepareItem(product, { selectedSizeId: ids.foreign, selectedAddonIds: [], quantity: 1 }), /Escolha um tamanho/);
  product.sizeOptions[1].isActive = true;
  assert.throws(() => OrderService.prepareItem(product, { selectedSizeId: ids.medium, selectedAddonIds: [ids.foreign], quantity: 1 }), /Adicional inválido/);
  product.addons[0].isActive = false;
  assert.throws(() => OrderService.prepareItem(product, { selectedSizeId: ids.medium, selectedAddonIds: [ids.pacoca], quantity: 1 }), /Adicional inválido/);
  assert.throws(() => OrderService.groupItems([{ productId: 8, selectedAddonIds: [ids.milk, ids.milk], quantity: 1 }]), /duplicados/);
});

test('desconto do produto afeta a base; cupom incide depois sobre a soma incluindo adicionais', () => {
  const product = { ...acai(), discountType: 'percentage', discountValue: 10 };
  const item = OrderService.prepareItem(product, { selectedSizeId: ids.medium, selectedAddonIds: [ids.pacoca, ids.milk], quantity: 1 });
  assert.equal(item.optionsSnapshot.productDiscount, 1.5);
  assert.equal(item.unitPrice, 18.5);
  assert.equal(item.optionsSnapshot.addons.reduce((sum, addon) => sum + addon.price, 0), 5);
});

test('cupom percentual usa o subtotal com adicionais, arredondado em centavos', async () => {
  const original = CouponRepository.findByCodeForOrder;
  CouponRepository.findByCodeForOrder = async () => ({ id: 4, code: 'ACAI10', isActive: true, discountType: 'percentage', discountValue: 10, usedCount: 0 });
  try {
    const coupon = await OrderService.resolveCoupon({ couponCode: 'ACAI10', sellerId: 2, environmentId: 1, totalPrice: 20, transaction: {} });
    assert.equal(coupon.discount, 2);
    assert.equal(coupon.finalTotal, 18);
  } finally {
    CouponRepository.findByCodeForOrder = original;
  }
});

test('validação não aceita preços ou totais enviados pelo navegador', () => {
  const request = {
    sellerId: 3, paymentMethod: 'pix', deliveryType: 'pickup',
    items: [{ productId: 8, selectedSizeId: ids.medium, selectedAddonIds: [ids.pacoca], quantity: 1, unitPrice: 0.01 }],
  };
  assert.ok(createOrderSchema.validate(request).error);
  delete request.items[0].unitPrice;
  request.totalPrice = 0.01;
  assert.ok(createOrderSchema.validate(request).error);
});

test('fotos de tamanhos seguem o ID, mesmo após reordenação', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0]);
  const original = ProductService.attachOptionImages(
    [{ id: ids.small, name: '300 ml', price: 10 }, { id: ids.medium, name: '500 ml', price: 15 }],
    [], JSON.stringify([ids.medium]),
    { sizeImages: [{ filename: '500.jpg', mimetype: 'image/jpeg', buffer: jpeg }] }, 'sizeImages'
  );
  const updated = ProductService.attachOptionImages(
    [{ id: ids.medium, name: '500 ml', price: 16 }, { id: ids.small, name: '300 ml', price: 10 }],
    original, null, null, 'sizeImages'
  );
  assert.equal(updated[0].imageUrl, '/uploads/500.jpg');
  assert.equal(updated[1].imageUrl, null);
  assert.throws(() => ProductService.attachOptionImages(updated, original, JSON.stringify([ids.foreign]), {
    sizeImages: [{ filename: 'other.jpg', mimetype: 'image/jpeg', buffer: jpeg }],
  }, 'sizeImages'), /opção inexistente/);
});

test('cadastro e edição preservam descrição e fotos dos adicionais pelo ID', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0]);
  const input = ProductService.normalizeChoiceList([
    { id: ids.pacoca, name: 'Paçoca', description: 'Farofa crocante', price: 2 },
    { id: ids.milk, name: 'Leite em pó', price: 3 },
  ], 'adicional');
  const created = ProductService.attachOptionImages(input, [], JSON.stringify([ids.pacoca]), {
    addonImages: [{ filename: 'pacoca.jpg', mimetype: 'image/jpeg', buffer: jpeg }],
  }, 'addonImages');
  const previous = ProductService.normalizeChoiceList(created, 'adicional', true);
  const reordered = ProductService.attachOptionImages([
    { id: ids.milk, name: 'Leite em pó', description: '', price: 3 },
    { id: ids.pacoca, name: 'Paçoca', description: 'Farofa crocante', price: 2 },
  ], previous, null, null, 'addonImages');
  assert.equal(reordered[1].description, 'Farofa crocante');
  assert.equal(reordered[1].imageUrl, '/uploads/pacoca.jpg');
  assert.equal(reordered[0].imageUrl, null);
  const replaced = ProductService.attachOptionImages(reordered, previous, JSON.stringify([ids.pacoca]), {
    addonImages: [{ filename: 'pacoca-new.jpg', mimetype: 'image/jpeg', buffer: jpeg }],
  }, 'addonImages');
  assert.equal(replaced[1].imageUrl, '/uploads/pacoca-new.jpg');
  const removed = ProductService.attachOptionImages([{ ...replaced[1], removeImage: true }], replaced, null, null, 'addonImages');
  assert.equal(removed[0].imageUrl, null);
  assert.throws(() => ProductService.attachOptionImages(reordered, previous, JSON.stringify([ids.foreign]), {
    addonImages: [{ filename: 'foreign.jpg', mimetype: 'image/jpeg', buffer: jpeg }],
  }, 'addonImages'), /opção inexistente/);
});

test('imagem e descrição do adicional ficam congeladas no pedido; valores manipulados são recusados', () => {
  const product = acai();
  product.addons[0].description = 'Farofa crocante';
  product.addons[0].imageUrl = '/uploads/pacoca.jpg';
  const item = OrderService.prepareItem(product, { selectedSizeId: ids.medium, selectedAddonIds: [ids.pacoca], quantity: 1 });
  product.addons[0].price = 99;
  product.addons[0].imageUrl = '/uploads/other.jpg';
  assert.deepEqual(item.optionsSnapshot.addons[0], {
    id: ids.pacoca, name: 'Paçoca', description: 'Farofa crocante', price: 2, imageUrl: '/uploads/pacoca.jpg',
  });
  assert.ok(createOrderSchema.validate({ sellerId: 3, paymentMethod: 'pix', deliveryType: 'pickup', items: [{ productId: 8, selectedSizeId: ids.medium, selectedAddonIds: [ids.pacoca], quantity: 1, subtotal: 0.01 }] }).error);
});
