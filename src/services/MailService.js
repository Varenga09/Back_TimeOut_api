const nodemailer = require('nodemailer');
const { Resend } = require('resend');

class MailService {
  isLocalDeliveryEnabled() {
    return process.env.NODE_ENV !== 'production' &&
      process.env.LOCAL_VERIFICATION_DELIVERY === 'true';
  }

  isConfigured() {
    return Boolean(process.env.RESEND_API_KEY) || Boolean(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD
    );
  }

  async sendWithResend(message) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send(message);

    if (error) {
      throw new Error(error.message || 'Falha ao enviar e-mail pelo Resend');
    }
  }

  createTransporter() {
    const password = (process.env.SMTP_PASSWORD || '').replace(/\s/g, '');

    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: password,
      },
    });
  }

  async sendVerificationCode({ to, name, code }) {
    if (!this.isConfigured()) {
      if (this.isLocalDeliveryEnabled()) {
        console.info(`[LOCAL VERIFICATION][email] ${to} (${name || 'sem nome'}): ${code}`);
        return {
          sent: true,
          reason: 'LOCAL_DELIVERY',
        };
      }

      return {
        sent: false,
        reason: 'SMTP_NOT_CONFIGURED',
      };
    }

    const from = process.env.MAIL_FROM || process.env.SMTP_USER;
    const appName = process.env.MAIL_APP_NAME || 'Local Food';
    const brandName = appName.replace(/LocalFood/g, 'Local Food');
    const subject = `${brandName} - Código de confirmação`;
    const text = [
      `Olá, somos da equipe do ${brandName}.`,
      '',
      `Recebemos uma solicitação de acesso à sua conta no ${brandName}.`,
      '',
      'Use o código abaixo para entrar no site:',
      '',
      code,
      '',
      'Esse código expira em alguns minutos.',
      'Se você não fez essa solicitação, ignore este e-mail.',
    ].join('\n');
    const html = `
      <div style="font-family: Arial, sans-serif; color: #101828; line-height: 1.5; max-width: 560px;">
        <h2 style="margin: 0 0 16px;">Olá, somos da equipe do ${brandName}</h2>
        <p>Recebemos uma solicitação de acesso à sua conta no ${brandName}.</p>
        <p>Use o código abaixo para entrar no site:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 28px 0; padding: 18px 22px; background: #eef4ff; border-radius: 10px; display: inline-block;">${code}</p>
        <p>Esse código expira em alguns minutos.</p>
        <p style="color: #667085;">Se você não fez essa solicitação, ignore este e-mail.</p>
      </div>
    `;

    try {
      if (process.env.RESEND_API_KEY) {
        await this.sendWithResend({
          from: process.env.RESEND_FROM || 'TimeOut <onboarding@resend.dev>',
          to,
          subject,
          text,
          html,
        });
      } else {
        await this.createTransporter().sendMail({ from, to, subject, text, html });
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }

      const message = error.message || '';
      const reason = /Invalid login|Username and Password|WebLoginRequired|534|535/i.test(message)
        ? 'SMTP_AUTH_FAILED'
        : 'SMTP_SEND_FAILED';

      console.warn('Falha ao enviar e-mail de verificação:', error.message);
      return {
        sent: false,
        reason,
      };
    }

    return {
      sent: true,
    };
  }
}

module.exports = new MailService();
