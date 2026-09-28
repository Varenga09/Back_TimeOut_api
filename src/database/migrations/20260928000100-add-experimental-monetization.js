'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('plans', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      code: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(80), allowNull: false },
      monthlyPrice: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      commissionRate: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      features: { type: Sequelize.JSON, allowNull: false, defaultValue: [] },
      isExperimental: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.createTable('subscriptions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      environmentId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'environments', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      planId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'plans', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
      monthlyPrice: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      commissionRate: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      startedAt: { type: Sequelize.DATE, allowNull: false },
      endedAt: { type: Sequelize.DATE, allowNull: true },
      status: { type: Sequelize.ENUM('active', 'canceled'), allowNull: false, defaultValue: 'active' },
      isSimulated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('subscriptions', ['userId', 'environmentId', 'status'], { name: 'subscriptions_user_environment_status' });

    await queryInterface.createTable('seller_requests', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      environmentId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'environments', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      status: { type: Sequelize.ENUM('pending', 'approved', 'rejected', 'blocked'), allowNull: false, defaultValue: 'pending' },
      requestedAt: { type: Sequelize.DATE, allowNull: false },
      reviewedAt: { type: Sequelize.DATE, allowNull: true },
      reviewedBy: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL', onUpdate: 'CASCADE' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('seller_requests', ['userId', 'environmentId'], { unique: true, name: 'seller_requests_user_environment_unique' });

    await queryInterface.createTable('mock_transactions', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      orderId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'orders', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      customerId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      sellerId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      environmentId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'environments', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
      paymentMethod: { type: Sequelize.STRING(40), allowNull: false },
      status: { type: Sequelize.ENUM('approved', 'pending', 'declined'), allowNull: false, defaultValue: 'pending' },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      simulatedAt: { type: Sequelize.DATE, allowNull: false },
      isSimulated: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('mock_transactions', ['orderId']);
    await queryInterface.addIndex('mock_transactions', ['sellerId', 'environmentId']);

    await queryInterface.addColumn('orders', 'grossSalesAmount', { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn('orders', 'commissionRate', { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn('orders', 'commissionAmount', { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn('orders', 'sellerNetRevenue', { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 });
    await queryInterface.addColumn('orders', 'commissionConfirmedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('orders', 'isPaymentSimulated', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn('environments', 'institutionalPlanConfig', { type: Sequelize.JSON, allowNull: true });

    const now = new Date();
    await queryInterface.bulkInsert('plans', [
      {
        code: 'basic', name: 'Básico', monthlyPrice: 0, commissionRate: 7,
        description: 'Recursos essenciais para começar a vender.',
        features: JSON.stringify(['Produtos e estoque', 'Pedidos', 'Histórico de vendas', 'Relatório financeiro básico']),
        isExperimental: true, isActive: true, createdAt: now, updatedAt: now,
      },
      {
        code: 'pro', name: 'Pro', monthlyPrice: 19.90, commissionRate: 3,
        description: 'Recursos avançados para vendedores em crescimento.',
        features: JSON.stringify(['Tudo do Básico', 'Relatórios detalhados', 'Gráfico de vendas', 'Produtos em destaque', 'Promoções', 'Suporte prioritário simulado']),
        isExperimental: true, isActive: true, createdAt: now, updatedAt: now,
      },
      {
        code: 'institutional', name: 'Institucional', monthlyPrice: 99, commissionRate: 0,
        description: 'Plano configurável para instituições e ambientes completos.',
        features: JSON.stringify(['Painel do ambiente', 'Controle de vendedores e usuários', 'Relatórios gerais', 'Código e QR Code', 'Personalização']),
        isExperimental: true, isActive: true, createdAt: now, updatedAt: now,
      },
    ]);

    const q = (name) => queryInterface.quoteIdentifier(name);
    await queryInterface.sequelize.query(`UPDATE ${q('orders')} SET ${q('grossSalesAmount')} = ${q('totalPrice')} WHERE ${q('grossSalesAmount')} = 0`);
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('environments', 'institutionalPlanConfig');
    await queryInterface.removeColumn('orders', 'isPaymentSimulated');
    await queryInterface.removeColumn('orders', 'commissionConfirmedAt');
    await queryInterface.removeColumn('orders', 'sellerNetRevenue');
    await queryInterface.removeColumn('orders', 'commissionAmount');
    await queryInterface.removeColumn('orders', 'commissionRate');
    await queryInterface.removeColumn('orders', 'grossSalesAmount');
    await queryInterface.dropTable('mock_transactions');
    await queryInterface.dropTable('seller_requests');
    await queryInterface.dropTable('subscriptions');
    await queryInterface.dropTable('plans');
  },
};
