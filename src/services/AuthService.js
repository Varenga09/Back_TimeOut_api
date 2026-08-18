const jwt = require('jsonwebtoken');
const EnvironmentRepository = require('../repositories/EnvironmentRepository');
const UserEnvironmentRepository = require('../repositories/UserEnvironmentRepository');
const UserRepository = require('../repositories/UserRepository');
const AppError = require('../utils/AppError');
const { generateEmailCode, getEmailCodeExpiresAt } = require('../utils/security');
const MailService = require('./MailService');
const SmsService = require('./SmsService');

const verificationChannels = ['email', 'sms', 'whatsapp'];

class AuthService {
  async register({ name, email, password, phone, environmentAccessCode }) {
    const environment = await EnvironmentRepository.findByAccessCode(environmentAccessCode);
    if (!environment) {
      throw new AppError('Código de ambiente inválido', 404);
    }

    const existingUser = await UserRepository.findByEmail(email);
    if (existingUser) {
      throw new AppError('Este e-mail já está em uso', 409);
    }

    const emailVerificationCode = generateEmailCode();

    const user = await UserRepository.create({
      name,
      email,
      password,
      phone,
      role: 'customer',
      environmentId: environment.id,
      emailVerificationCode,
      emailVerificationExpiresAt: getEmailCodeExpiresAt(),
    });

    await UserEnvironmentRepository.createIfMissing(user.id, environment.id, 'customer');

    const deliveryResult = await this.sendVerificationCode(user, emailVerificationCode, 'email');

    return {
      user: await UserRepository.findById(user.id),
      verificationSent: deliveryResult.sent,
      verificationReason: deliveryResult.reason,
      verificationChannel: 'email',
      emailSent: deliveryResult.sent,
      emailReason: deliveryResult.reason,
    };
  }

  async login(email, password) {
    const user = await UserRepository.findByEmail(email);
    if (!user) {
      throw new AppError('E-mail ou senha inválidos', 401);
    }

    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      throw new AppError('E-mail ou senha inválidos', 401);
    }

    if (!process.env.JWT_SECRET) {
      throw new AppError('JWT_SECRET não configurado', 500);
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        environmentId: user.environmentId,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
    );

    return {
      token,
      user: user.toJSON(),
    };
  }

  async me(userId) {
    const user = await UserRepository.findById(userId);
    if (!user) {
      throw new AppError('Usuário não encontrado', 404);
    }

    return user;
  }

  async verifyEmail(userId, code) {
    const user = await UserRepository.findRawById(userId);
    if (!user) {
      throw new AppError('Usuário não encontrado', 404);
    }

    if (user.emailVerifiedAt || user.phoneVerifiedAt) {
      return UserRepository.findById(userId);
    }

    if (!user.emailVerificationCode || user.emailVerificationCode !== code) {
      throw new AppError('Código de verificação inválido', 400);
    }

    if (!user.emailVerificationExpiresAt || user.emailVerificationExpiresAt < new Date()) {
      throw new AppError('Código expirado. Solicite um novo código', 400);
    }

    const channel = user.verificationChannel || 'email';
    await user.update({
      ...(channel === 'email'
        ? { emailVerifiedAt: new Date() }
        : { phoneVerifiedAt: new Date() }),
      emailVerificationCode: null,
      emailVerificationExpiresAt: null,
    });

    return UserRepository.findById(userId);
  }

  async resendVerification(userId, channel = 'email') {
    const user = await UserRepository.findRawById(userId);
    if (!user) {
      throw new AppError('Usuário não encontrado', 404);
    }

    if (user.emailVerifiedAt || user.phoneVerifiedAt) {
      return {
        user: await UserRepository.findById(userId),
        verificationSent: true,
        verificationChannel: user.emailVerifiedAt ? 'email' : 'sms',
      };
    }

    const selectedChannel = this.normalizeVerificationChannel(channel);
    if (selectedChannel !== 'email' && !user.phone) {
      throw new AppError('Cadastre um telefone antes de usar SMS ou WhatsApp', 400);
    }

    const emailVerificationCode = generateEmailCode();
    await user.update({
      emailVerificationCode,
      emailVerificationExpiresAt: getEmailCodeExpiresAt(),
      verificationChannel: selectedChannel,
    });

    const deliveryResult = await this.sendVerificationCode(user, emailVerificationCode, selectedChannel);

    return {
      user: await UserRepository.findById(userId),
      verificationSent: deliveryResult.sent,
      verificationReason: deliveryResult.reason,
      verificationChannel: selectedChannel,
      verificationTarget: this.getVerificationTarget(user, selectedChannel),
      emailSent: selectedChannel === 'email' ? deliveryResult.sent : false,
      emailReason: deliveryResult.reason,
    };
  }

  normalizeVerificationChannel(channel) {
    const selectedChannel = String(channel || 'email').trim().toLowerCase();
    if (!verificationChannels.includes(selectedChannel)) {
      throw new AppError('Canal de verificação inválido', 400);
    }

    return selectedChannel;
  }

  async sendVerificationCode(user, code, channel) {
    const selectedChannel = this.normalizeVerificationChannel(channel);

    if (selectedChannel === 'email') {
      return MailService.sendVerificationCode({
        to: user.email,
        name: user.name,
        code,
      });
    }

    if (!user.phone) {
      throw new AppError('Cadastre um telefone antes de usar SMS ou WhatsApp', 400);
    }

    return SmsService.sendVerificationCode({
      to: user.phone,
      code,
      channel: selectedChannel,
    });
  }

  getVerificationTarget(user, channel) {
    if (channel === 'email') return user.email;
    return user.phone;
  }
}

module.exports = new AuthService();
