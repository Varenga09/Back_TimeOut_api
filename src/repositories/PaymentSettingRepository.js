const { PaymentSetting } = require('../models');

class PaymentSettingRepository {
  async findBySeller(userId, environmentId) {
    return PaymentSetting.findOne({
      where: { userId, environmentId },
    });
  }

  async findOrCreateBySeller(userId, environmentId) {
    const [paymentSetting] = await PaymentSetting.findOrCreate({
      where: { userId, environmentId },
      defaults: {
        userId,
        environmentId,
      },
    });

    return paymentSetting;
  }

  async update(paymentSetting, data) {
    return paymentSetting.update(data);
  }
}

module.exports = new PaymentSettingRepository();
