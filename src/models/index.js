'use strict';

const { Sequelize } = require('sequelize');
const dbConfig = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const config = dbConfig[env];

const sequelize = config.use_env_variable
  ? new Sequelize(process.env[config.use_env_variable], config)
  : new Sequelize(config.database, config.username, config.password, config);

const Environment = require('./Environment')(sequelize);
const User = require('./User')(sequelize);
const Category = require('./Category')(sequelize);
const Product = require('./Product')(sequelize);
const Order = require('./Order')(sequelize);
const OrderItem = require('./OrderItem')(sequelize);
const ProductReview = require('./ProductReview')(sequelize);
const UserEnvironment = require('./UserEnvironment')(sequelize);
const Coupon = require('./Coupon')(sequelize);
const PaymentSetting = require('./PaymentSetting')(sequelize);
const PaymentTransaction = require('./PaymentTransaction')(sequelize);
const Plan = require('./Plan')(sequelize);
const Subscription = require('./Subscription')(sequelize);
const SellerRequest = require('./SellerRequest')(sequelize);
const MockTransaction = require('./MockTransaction')(sequelize);
const EnvironmentApplication = require('./EnvironmentApplication')(sequelize);
const Notification = require('./Notification')(sequelize);
const AuditLog = require('./AuditLog')(sequelize);
const EnvironmentAccessCode = require('./EnvironmentAccessCode')(sequelize);
const SellerPayoutAccount = require('./SellerPayoutAccount')(sequelize);

const models = {
  Environment,
  User,
  Category,
  Product,
  Order,
  OrderItem,
  ProductReview,
  UserEnvironment,
  Coupon,
  PaymentSetting,
  PaymentTransaction,
  Plan,
  Subscription,
  SellerRequest,
  MockTransaction,
  EnvironmentApplication,
  Notification,
  AuditLog,
  EnvironmentAccessCode,
  SellerPayoutAccount,
};

Object.values(models).forEach((model) => {
  if (model.associate) {
    model.associate(models);
  }
});

module.exports = {
  sequelize,
  Sequelize,
  ...models,
};
