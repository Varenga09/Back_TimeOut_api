'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    const addEnumValue = async (type, value) => {
      if (dialect === 'postgres') {
        await queryInterface.sequelize.query(`ALTER TYPE "${type}" ADD VALUE IF NOT EXISTS '${value}'`);
      }
    };

    await addEnumValue('enum_users_role', 'environment_admin');
    await addEnumValue('enum_users_role', 'platform_admin');
    await addEnumValue('enum_user_environments_role', 'environment_admin');
    for (const status of ['under_review', 'changes_requested', 'suspended', 'revoked']) {
      await addEnumValue('enum_seller_requests_status', status);
    }

    if (dialect !== 'postgres') {
      await queryInterface.changeColumn('users', 'role', {
        type: Sequelize.ENUM('customer', 'seller', 'admin', 'environment_admin', 'platform_admin'),
        allowNull: false,
        defaultValue: 'customer',
      });
      await queryInterface.changeColumn('user_environments', 'role', {
        type: Sequelize.ENUM('customer', 'seller', 'admin', 'environment_admin'),
        allowNull: false,
        defaultValue: 'customer',
      });
      await queryInterface.changeColumn('seller_requests', 'status', {
        type: Sequelize.ENUM('pending', 'under_review', 'changes_requested', 'approved', 'rejected', 'suspended', 'revoked', 'blocked'),
        allowNull: false,
        defaultValue: 'pending',
      });
    }

    await queryInterface.addColumn('environments', 'isPrivate', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn('environments', 'status', { type: Sequelize.ENUM('active', 'suspended'), allowNull: false, defaultValue: 'active' });
    await queryInterface.addColumn('environments', 'accessCodeEnabled', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true });
    if (dialect !== 'postgres') {
      const foreignKeys = await queryInterface.getForeignKeyReferencesForTable('users');
      const environmentForeignKey = foreignKeys.find((foreignKey) => foreignKey.columnName === 'environmentId');
      if (environmentForeignKey?.constraintName) {
        await queryInterface.removeConstraint('users', environmentForeignKey.constraintName);
      }
    }
    await queryInterface.changeColumn('users', 'environmentId', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addConstraint('users', {
      fields: ['environmentId'],
      type: 'foreign key',
      name: 'users_environment_fk',
      references: { table: 'environments', field: 'id' },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE',
    });
    await queryInterface.addColumn('user_environments', 'status', {
      type: Sequelize.ENUM('pending', 'approved', 'rejected', 'suspended'),
      allowNull: false,
      defaultValue: 'approved',
    });
    await queryInterface.addColumn('user_environments', 'reviewedAt', { type: Sequelize.DATE, allowNull: true });
    await queryInterface.addColumn('user_environments', 'reviewedBy', { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' });

    const sellerColumns = {
      fullName: { type: Sequelize.STRING(120), allowNull: true },
      birthDate: { type: Sequelize.DATEONLY, allowNull: true },
      phone: { type: Sequelize.STRING(30), allowNull: true },
      storeName: { type: Sequelize.STRING(120), allowNull: true },
      activityDescription: { type: Sequelize.TEXT, allowNull: true },
      productCategories: { type: Sequelize.JSON, allowNull: true },
      reason: { type: Sequelize.TEXT, allowNull: true },
      acceptedTerms: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      decisionReason: { type: Sequelize.TEXT, allowNull: true },
      correctionNotes: { type: Sequelize.TEXT, allowNull: true },
      history: { type: Sequelize.JSON, allowNull: false, defaultValue: [] },
    };
    for (const [name, definition] of Object.entries(sellerColumns)) {
      await queryInterface.addColumn('seller_requests', name, definition);
    }

    await queryInterface.createTable('environment_applications', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      status: { type: Sequelize.ENUM('pending', 'under_review', 'changes_requested', 'approved', 'rejected', 'suspended', 'revoked'), allowNull: false, defaultValue: 'pending' },
      responsibleName: { type: Sequelize.STRING(120), allowNull: false },
      cpf: { type: Sequelize.STRING(11), allowNull: false },
      phone: { type: Sequelize.STRING(30), allowNull: false },
      institutionName: { type: Sequelize.STRING(160), allowNull: false },
      institutionType: { type: Sequelize.STRING(50), allowNull: false },
      cnpj: { type: Sequelize.STRING(14), allowNull: true },
      address: { type: Sequelize.STRING(255), allowNull: false },
      relationship: { type: Sequelize.STRING(160), allowNull: false },
      justification: { type: Sequelize.TEXT, allowNull: false },
      environmentDescription: { type: Sequelize.TEXT, allowNull: false },
      documentPath: { type: Sequelize.STRING(500), allowNull: true },
      environmentId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'environments', key: 'id' }, onDelete: 'SET NULL' },
      reviewedBy: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      decisionReason: { type: Sequelize.TEXT, allowNull: true },
      correctionNotes: { type: Sequelize.TEXT, allowNull: true },
      decidedAt: { type: Sequelize.DATE, allowNull: true },
      history: { type: Sequelize.JSON, allowNull: false, defaultValue: [] },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('environment_applications', ['userId', 'status']);

    await queryInterface.createTable('notifications', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      userId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
      title: { type: Sequelize.STRING(160), allowNull: false },
      message: { type: Sequelize.TEXT, allowNull: false },
      type: { type: Sequelize.STRING(50), allowNull: false },
      internalLink: { type: Sequelize.STRING(255), allowNull: true },
      readAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('notifications', ['userId', 'readAt']);

    await queryInterface.createTable('audit_logs', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      actorId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      action: { type: Sequelize.STRING(100), allowNull: false },
      resourceType: { type: Sequelize.STRING(80), allowNull: false },
      resourceId: { type: Sequelize.STRING(80), allowNull: true },
      environmentId: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'environments', key: 'id' }, onDelete: 'SET NULL' },
      summary: { type: Sequelize.STRING(500), allowNull: false },
      metadata: { type: Sequelize.JSON, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('audit_logs', ['environmentId', 'createdAt']);

    await queryInterface.createTable('environment_access_codes', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
      environmentId: { type: Sequelize.INTEGER, allowNull: false, references: { model: 'environments', key: 'id' }, onDelete: 'CASCADE' },
      codeHash: { type: Sequelize.STRING(64), allowNull: false, unique: true },
      codePreview: { type: Sequelize.STRING(30), allowNull: false },
      isActive: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      createdBy: { type: Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onDelete: 'SET NULL' },
      revokedAt: { type: Sequelize.DATE, allowNull: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
    await queryInterface.addIndex('environment_access_codes', ['environmentId', 'isActive']);

    const q = (name) => queryInterface.quoteIdentifier(name);
    await queryInterface.sequelize.query(`UPDATE ${q('users')} SET ${q('role')} = 'environment_admin' WHERE ${q('role')} = 'admin'`);
    await queryInterface.sequelize.query(`UPDATE ${q('user_environments')} SET ${q('role')} = 'environment_admin' WHERE ${q('role')} = 'admin'`);
  },

  async down() {
    // This migration intentionally has no destructive rollback. It preserves
    // identities, memberships, requests and audit history.
  },
};
