const nodemailer = require('nodemailer');
const { BrevoClient } = require('@getbrevo/brevo');

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

class MailService {
  isLocalDeliveryEnabled() {
    return process.env.NODE_ENV !== 'production' &&
      process.env.LOCAL_VERIFICATION_DELIVERY === 'true';
  }

  isConfigured() {
    return this.isBrevoConfigured() || Boolean(
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASSWORD
    );
  }

  isBrevoConfigured() {
    return Boolean(process.env.BREVO_API_KEY && process.env.BREVO_FROM_EMAIL);
  }

  async sendWithBrevo({ to, name, subject, text, html }) {
    const brevo = new BrevoClient({
      apiKey: process.env.BREVO_API_KEY,
      timeoutInSeconds: 15,
      maxRetries: 2,
    });

    await brevo.transactionalEmails.sendTransacEmail({
      sender: {
        name: process.env.BREVO_FROM_NAME || process.env.MAIL_APP_NAME || 'TimeOut',
        email: process.env.BREVO_FROM_EMAIL,
      },
      to: [{ email: to, ...(name ? { name } : {}) }],
      subject,
      textContent: text,
      htmlContent: html,
    });
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

  async deliver({ to, name, subject, text, html }) {
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;

    try {
      if (this.isBrevoConfigured()) {
        await this.sendWithBrevo({ to, name, subject, text, html });
      } else {
        await this.createTransporter().sendMail({ from, to, subject, text, html });
      }
    } catch (error) {
      const message = error.message || '';
      const statusCode = error.statusCode || error.status;
      const reason = this.isBrevoConfigured()
        ? statusCode === 401
          ? 'BREVO_AUTH_FAILED'
          : statusCode === 429
            ? 'BREVO_RATE_LIMITED'
            : /sender|not valid|not verified/i.test(message)
              ? 'BREVO_SENDER_INVALID'
              : 'BREVO_SEND_FAILED'
        : /Invalid login|Username and Password|WebLoginRequired|534|535/i.test(message)
          ? 'SMTP_AUTH_FAILED'
          : 'SMTP_SEND_FAILED';

      console.warn('Falha ao enviar e-mail:', reason, error.message);
      return { sent: false, reason };
    }

    return { sent: true };
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
        reason: 'EMAIL_NOT_CONFIGURED',
      };
    }

    const appName = process.env.MAIL_APP_NAME || 'Local Food';
    const brandName = appName.replace(/LocalFood/g, 'Local Food');
    const safeBrandName = escapeHtml(brandName);
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
        <h2 style="margin: 0 0 16px;">Olá, somos da equipe do ${safeBrandName}</h2>
        <p>Recebemos uma solicitação de acesso à sua conta no ${safeBrandName}.</p>
        <p>Use o código abaixo para entrar no site:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 28px 0; padding: 18px 22px; background: #eef4ff; border-radius: 10px; display: inline-block;">${code}</p>
        <p>Esse código expira em alguns minutos.</p>
        <p style="color: #667085;">Se você não fez essa solicitação, ignore este e-mail.</p>
      </div>
    `;

    return this.deliver({ to, name, subject, text, html });
  }

  async sendPasswordResetCode({ to, name, code }) {
    if (!this.isConfigured()) {
      if (this.isLocalDeliveryEnabled()) {
        console.info(`[LOCAL PASSWORD RESET] ${to} (${name || 'sem nome'}): ${code}`);
        return { sent: true, reason: 'LOCAL_DELIVERY' };
      }
      return { sent: false, reason: 'EMAIL_NOT_CONFIGURED' };
    }

    const appName = process.env.MAIL_APP_NAME || 'TimeOut';
    const safeAppName = escapeHtml(appName);
    const safeName = escapeHtml(name || 'usuário');
    const subject = `${appName} - Recuperação de senha`;
    const text = [
      `Olá, ${name || 'usuário'}.`,
      '',
      `Use o código ${code} para criar uma nova senha no ${appName}.`,
      'O código expira em 15 minutos.',
      'Se você não solicitou a recuperação, ignore este e-mail.',
    ].join('\n');
    const html = `
      <div style="font-family: Arial, sans-serif; color: #101828; line-height: 1.5; max-width: 560px;">
        <h2 style="margin: 0 0 16px;">Recuperação de senha</h2>
        <p>Olá, ${safeName}.</p>
        <p>Use o código abaixo para criar uma nova senha no ${safeAppName}:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 6px; margin: 28px 0; padding: 18px 22px; background: #eef4ff; border-radius: 10px; display: inline-block;">${code}</p>
        <p>O código expira em 15 minutos.</p>
        <p style="color: #667085;">Se você não solicitou a recuperação, ignore este e-mail.</p>
      </div>
    `;

    return this.deliver({ to, name, subject, text, html });
  }
}

module.exports = new MailService();
