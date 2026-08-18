const AppError = require('../utils/AppError');

const MERCADO_PAGO_API_URL = 'https://api.mercadopago.com';

class MercadoPagoService {
  isConfigured() {
    return Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN);
  }

  async createPixPayment({ order }) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        reason: 'MERCADO_PAGO_NOT_CONFIGURED',
      };
    }

    const customer = order.customer;
    const [firstName, ...lastName] = String(customer?.name || '').split(' ');
    const payload = {
      transaction_amount: Number(order.totalPrice),
      description: `Pedido #${order.id} - LocalFood`,
      payment_method_id: 'pix',
      external_reference: String(order.id),
      notification_url: process.env.MERCADO_PAGO_WEBHOOK_URL || undefined,
      payer: {
        email: customer?.email,
        first_name: firstName || customer?.name,
        last_name: lastName.join(' ') || undefined,
      },
    };

    const response = await this.request('/v1/payments', {
      method: 'POST',
      body: payload,
      idempotencyKey: `localfood-pix-order-${order.id}`,
    });

    return {
      configured: true,
      response,
      providerPaymentId: response.id ? String(response.id) : null,
      status: this.mapPaymentStatus(response.status),
      qrCode: response.point_of_interaction?.transaction_data?.qr_code || null,
      qrCodeBase64: response.point_of_interaction?.transaction_data?.qr_code_base64 || null,
      checkoutUrl: response.point_of_interaction?.transaction_data?.ticket_url || null,
      paidAmount: Number(response.transaction_amount || 0),
    };
  }

  async createCardCheckout({ order }) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        reason: 'MERCADO_PAGO_NOT_CONFIGURED',
      };
    }

    const payload = {
      external_reference: String(order.id),
      notification_url: process.env.MERCADO_PAGO_WEBHOOK_URL || undefined,
      items: order.items.map((item) => ({
        id: String(item.productId),
        title: item.selectedFlavor
          ? `${item.product?.name || 'Produto'} - ${item.selectedFlavor}`
          : item.product?.name || 'Produto LocalFood',
        quantity: Number(item.quantity),
        unit_price: Number(item.unitPrice),
        currency_id: 'BRL',
      })),
      payer: {
        name: order.customer?.name,
        email: order.customer?.email,
      },
      payment_methods: {
        excluded_payment_types: [
          { id: 'ticket' },
          { id: 'bank_transfer' },
        ],
        installments: 12,
      },
      back_urls: {
        success: process.env.CHECKOUT_SUCCESS_URL || undefined,
        pending: process.env.CHECKOUT_PENDING_URL || undefined,
        failure: process.env.CHECKOUT_FAILURE_URL || undefined,
      },
      auto_return: 'approved',
    };

    const response = await this.request('/checkout/preferences', {
      method: 'POST',
      body: payload,
      idempotencyKey: `localfood-card-order-${order.id}`,
    });

    return {
      configured: true,
      response,
      providerPreferenceId: response.id ? String(response.id) : null,
      status: 'pending',
      checkoutUrl: response.init_point || response.sandbox_init_point || null,
    };
  }

  async getPayment(providerPaymentId) {
    if (!this.isConfigured()) {
      throw new AppError('Mercado Pago não configurado', 500);
    }

    return this.request(`/v1/payments/${providerPaymentId}`, {
      method: 'GET',
    });
  }

  async request(path, { method = 'GET', body, idempotencyKey } = {}) {
    const headers = {
      Authorization: `Bearer ${process.env.MERCADO_PAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    };

    if (idempotencyKey) {
      headers['X-Idempotency-Key'] = idempotencyKey;
    }

    const response = await fetch(`${MERCADO_PAGO_API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { message: text };
    }

    if (!response.ok) {
      throw new AppError(
        data.message || data.error || 'Falha ao comunicar com o Mercado Pago',
        response.status >= 500 ? 502 : 400,
        data
      );
    }

    return data;
  }

  mapPaymentStatus(status) {
    const statusMap = {
      approved: 'approved',
      pending: 'pending',
      in_process: 'in_process',
      rejected: 'rejected',
      cancelled: 'cancelled',
      refunded: 'refunded',
      charged_back: 'failed',
    };

    return statusMap[status] || 'pending';
  }
}

module.exports = new MercadoPagoService();
