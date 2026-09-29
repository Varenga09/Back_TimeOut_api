const { Router } = require('express');
const authRoutes = require('./authRoutes');
const categoryRoutes = require('./categoryRoutes');
const couponRoutes = require('./couponRoutes');
const environmentRoutes = require('./environmentRoutes');
const orderRoutes = require('./orderRoutes');
const paymentRoutes = require('./paymentRoutes');
const productRoutes = require('./productRoutes');
const sellerRoutes = require('./sellerRoutes');
const userRoutes = require('./userRoutes');
const planRoutes = require('./planRoutes');
const accessRoutes = require('./accessRoutes');
const { successResponse } = require('../utils/response');

const router = Router();

router.get('/', (req, res) => {
  return successResponse(
    res,
    {
      name: 'Time Out API',
      version: '1.0.0',
      status: 'online',
      basePath: '/api/v1',
      endpoints: ['/auth', '/environments', '/users', '/sellers', '/products', '/categories', '/coupons', '/orders', '/payments', '/plans'],
    },
    'Time Out API online'
  );
});

router.get('/health', (req, res) => {
  return successResponse(
    res,
    {
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    'API funcionando'
  );
});

router.use('/auth', authRoutes);
router.use('/environments', environmentRoutes);
router.use('/users', userRoutes);
router.use('/sellers', sellerRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/coupons', couponRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/plans', planRoutes);
router.use('/access', accessRoutes);

module.exports = router;
