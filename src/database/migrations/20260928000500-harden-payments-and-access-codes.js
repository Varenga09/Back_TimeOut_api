'use strict';

const crypto = require('crypto');

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const dialect = queryInterface.sequelize.getDialect();
    const q = (name) => queryInterface.quoteIdentifier(name);
    const transaction = await queryInterface.sequelize.transaction();

    try {
      await queryInterface.addColumn('mock_transactions', 'settlementBlockedAt', { type: Sequelize.DATE, allowNull: true }, { transaction });
      await queryInterface.addColumn('mock_transactions', 'settlementBlockedReason', { type: Sequelize.STRING(255), allowNull: true }, { transaction });
      await queryInterface.addColumn('mock_transactions', 'settlementReleasedBy', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onDelete: 'SET NULL',
      }, { transaction });
      await queryInterface.addColumn('mock_transactions', 'principalOrderId', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'orders', key: 'id' },
        onDelete: 'CASCADE',
      }, { transaction });

      if (dialect === 'postgres') {
        await queryInterface.sequelize.query(`
          UPDATE ${q('mock_transactions')} AS current
          SET ${q('principalOrderId')} = current.${q('orderId')}
          WHERE current.${q('id')} = (
            SELECT MAX(candidate.${q('id')})
            FROM ${q('mock_transactions')} AS candidate
            WHERE candidate.${q('orderId')} = current.${q('orderId')}
          )
        `, { transaction });
      } else {
        await queryInterface.sequelize.query(`
          UPDATE ${q('mock_transactions')} AS current
          INNER JOIN (
            SELECT ${q('orderId')}, MAX(${q('id')}) AS latestId
            FROM ${q('mock_transactions')}
            GROUP BY ${q('orderId')}
          ) AS latest ON latest.latestId = current.${q('id')}
          SET current.${q('principalOrderId')} = current.${q('orderId')}
        `, { transaction });
      }
      await queryInterface.addIndex('mock_transactions', ['principalOrderId'], {
        unique: true,
        name: 'mock_transactions_principal_order_unique',
        transaction,
      });

      const environments = await queryInterface.sequelize.query(
        `SELECT ${q('id')} AS id, ${q('accessCode')} AS ${q('accessCode')} FROM ${q('environments')}`,
        { type: Sequelize.QueryTypes.SELECT, transaction }
      );

      for (const environment of environments) {
        const code = String(environment.accessCode || '').trim();
        const activeCodes = await queryInterface.sequelize.query(
          `SELECT ${q('id')} AS id FROM ${q('environment_access_codes')} WHERE ${q('environmentId')} = :environmentId AND ${q('isActive')} = :isActive LIMIT 1`,
          { replacements: { environmentId: environment.id, isActive: true }, type: Sequelize.QueryTypes.SELECT, transaction }
        );

        if (activeCodes.length === 0) {
          if (!code) throw new Error(`Ambiente ${environment.id} não possui código de acesso migrável`);
          await queryInterface.bulkInsert('environment_access_codes', [{
            environmentId: environment.id,
            codeHash: hashCode(code),
            codePreview: `****${code.slice(-4)}`,
            isActive: true,
            createdBy: null,
            revokedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }], { transaction });
        }
      }

      await queryInterface.sequelize.query(
        `UPDATE ${q('notifications')} SET ${q('message')} = :safeMessage WHERE ${q('message')} LIKE :unsafePattern`,
        {
          replacements: {
            safeMessage: 'Ambiente aprovado. O código de acesso foi exibido uma única vez durante a aprovação.',
            unsafePattern: '%Código inicial:%',
          },
          transaction,
        }
      );
      await queryInterface.changeColumn('environments', 'accessCode', {
        type: Sequelize.STRING(50),
        allowNull: true,
        unique: true,
      }, { transaction });
      await queryInterface.sequelize.query(`UPDATE ${q('environments')} SET ${q('accessCode')} = NULL`, { transaction });

      const missingCodes = await queryInterface.sequelize.query(`
        SELECT environment.${q('id')} AS id
        FROM ${q('environments')} AS environment
        LEFT JOIN ${q('environment_access_codes')} AS access_code
          ON access_code.${q('environmentId')} = environment.${q('id')}
          AND access_code.${q('isActive')} = ${dialect === 'postgres' ? 'TRUE' : '1'}
        WHERE access_code.${q('id')} IS NULL
      `, { type: Sequelize.QueryTypes.SELECT, transaction });
      if (missingCodes.length > 0) throw new Error('Existem ambientes sem código de acesso protegido');

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async down() {
    // No destructive rollback: hashes, financial locks and audit history are preserved.
  },
};
