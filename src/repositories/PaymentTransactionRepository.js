const { PaymentTransaction } = require('../models');

class PaymentTransactionRepository {
  async create(data, transaction = null) {
    return PaymentTransaction.create(data, { transaction });
  }

  async findById(id) {
    return PaymentTransaction.findByPk(id);
  }

  async findLatestByOrder(orderId) {
    return PaymentTransaction.findOne({
      where: { orderId },
      order: [['createdAt', 'DESC']],
    });
  }

  async findByProviderPaymentId(providerPaymentId) {
    return PaymentTransaction.findOne({
      where: { providerPaymentId },
    });
  }

  async findByExternalReference(externalReference) {
    return PaymentTransaction.findOne({
      where: { externalReference },
      order: [['createdAt', 'DESC']],
    });
  }

  async update(paymentTransaction, data, transaction = null) {
    return paymentTransaction.update(data, { transaction });
  }
}

module.exports = new PaymentTransactionRepository();
