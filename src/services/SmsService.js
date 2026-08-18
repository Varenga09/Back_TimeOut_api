class SmsService {
  isLocalDeliveryEnabled() {
    return process.env.NODE_ENV !== 'production' &&
      process.env.LOCAL_VERIFICATION_DELIVERY === 'true';
  }

  isConfigured(channel = 'sms') {
    const hasBaseConfig = Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN
    );

    if (!hasBaseConfig) return false;

    if (channel === 'whatsapp') {
      return Boolean(process.env.TWILIO_FROM_WHATSAPP);
    }

    return Boolean(process.env.TWILIO_FROM_SMS);
  }

  normalizeBrazilPhone(phone) {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';

    if (digits.startsWith('55') && digits.length >= 12) {
      return `+${digits}`;
    }

    if (digits.length === 10 || digits.length === 11) {
      return `+55${digits}`;
    }

    return digits.startsWith('+') ? digits : `+${digits}`;
  }

  async sendVerificationCode({ to, code, channel = 'sms' }) {
    if (!this.isConfigured(channel)) {
      if (this.isLocalDeliveryEnabled()) {
        const normalizedPhone = this.normalizeBrazilPhone(to);
        console.info(`[LOCAL VERIFICATION][${channel}] ${normalizedPhone}: ${code}`);
        return {
          sent: true,
          reason: 'LOCAL_DELIVERY',
        };
      }

      return {
        sent: false,
        reason: channel === 'whatsapp' ? 'WHATSAPP_NOT_CONFIGURED' : 'SMS_NOT_CONFIGURED',
      };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const normalizedPhone = this.normalizeBrazilPhone(to);
    const from = channel === 'whatsapp'
      ? `whatsapp:${process.env.TWILIO_FROM_WHATSAPP}`
      : process.env.TWILIO_FROM_SMS;
    const destination = channel === 'whatsapp'
      ? `whatsapp:${normalizedPhone}`
      : normalizedPhone;

    const body = [
      'Olá, somos da equipe do Local Food.',
      `Seu código de verificação é: ${code}`,
      'Esse código expira em alguns minutos.',
      'Se você não fez essa solicitação, ignore esta mensagem.',
    ].join('\n');

    const payload = new URLSearchParams({
      From: from,
      To: destination,
      Body: body,
    });

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: payload,
        }
      );

      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Twilio retornou status ${response.status}`);
      }

      return { sent: true };
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }

      console.warn(`Falha ao enviar código por ${channel}:`, error.message);
      return {
        sent: false,
        reason: channel === 'whatsapp' ? 'WHATSAPP_SEND_FAILED' : 'SMS_SEND_FAILED',
      };
    }
  }
}

module.exports = new SmsService();
