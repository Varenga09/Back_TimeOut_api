const UserRepository = require('../repositories/UserRepository');
const UserEnvironmentRepository = require('../repositories/UserEnvironmentRepository');
const EnvironmentRepository = require('../repositories/EnvironmentRepository');
const AppError = require('../utils/AppError');
const { generateEmailCode, getEmailCodeExpiresAt, hashSecurityCode } = require('../utils/security');
const MailService = require('./MailService');
const { isEnvironmentAdmin } = require('../utils/permissions');

function removeUndefined(data) {
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

class UserService {
  async getAll(query, requester) {
    if (!isEnvironmentAdmin(requester)) {
      throw new AppError('Apenas admins podem listar usuários', 403);
    }

    return EnvironmentRepository.listUsers(requester.environmentId, query);
  }

  async getById(id, requester) {
    const user = await UserRepository.findById(id);
    if (!user) {
      throw new AppError('Usuário não encontrado', 404);
    }

    const sameEnvironment = Number(user.environmentId) === Number(requester.environmentId) ||
      Boolean(await UserEnvironmentRepository.findOne(user.id, requester.environmentId));
    const ownProfile = Number(user.id) === Number(requester.id);

    if (!ownProfile && (!isEnvironmentAdmin(requester) || !sameEnvironment)) {
      throw new AppError('Você não tem acesso a este usuário', 403);
    }

    return user;
  }

  async update(id, data, requester, file = null) {
    const user = await UserRepository.findById(id);
    if (!user) {
      throw new AppError('Usuário não encontrado', 404);
    }

    const ownProfile = Number(user.id) === Number(requester.id);
    const targetMembership = await UserEnvironmentRepository.findOne(id, requester.environmentId);
    const adminSameEnvironment = isEnvironmentAdmin(requester) && Boolean(targetMembership);

    if (!ownProfile && !adminSameEnvironment) {
      throw new AppError('Você não pode atualizar este usuário', 403);
    }

    if (data.password) {
      if (!ownProfile) {
        throw new AppError('Administradores não podem definir a senha de outro usuário', 403);
      }

      const rawUser = await UserRepository.findRawById(id);
      const passwordMatches = await rawUser.comparePassword(data.currentPassword || '');
      if (!passwordMatches) {
        throw new AppError('Senha atual incorreta', 401);
      }
    }

    if (data.email && data.email !== user.email) {
      const emailInUse = await UserRepository.findByEmail(data.email);
      if (emailInUse) {
        throw new AppError('Este e-mail já está em uso', 409);
      }
    }

    const allowedData = ownProfile && !adminSameEnvironment
      ? {
          name: data.name,
          email: data.email,
          phone: data.phone,
          password: data.password,
          profileImageUrl: data.profileImageUrl,
        }
      : {
          ...data,
          role: undefined,
          currentPassword: undefined,
          password: ownProfile ? data.password : undefined,
          ...(Number(user.environmentId) !== Number(requester.environmentId) && { role: undefined }),
        };
    const emailChanged = data.email && data.email !== user.email;
    const phoneChanged = data.phone && data.phone !== user.phone;
    const mockIdentity = process.env.IDENTITY_VERIFICATION_MODE !== 'live';
    const verificationCode = emailChanged && !mockIdentity ? generateEmailCode() : null;

    const updatedUser = await UserRepository.update(
      id,
      removeUndefined({
        ...allowedData,
        ...(emailChanged && {
          emailVerifiedAt: mockIdentity ? new Date() : null,
          emailVerificationCode: verificationCode ? hashSecurityCode(verificationCode) : null,
          emailVerificationExpiresAt: verificationCode ? getEmailCodeExpiresAt() : null,
          verificationChannel: 'email',
        }),
        ...(phoneChanged && {
          phoneVerifiedAt: null,
        }),
        ...(data.password && {
          tokenVersion: Number((await UserRepository.findRawById(id)).tokenVersion || 0) + 1,
        }),
        ...(file && { profileImageUrl: `/uploads/${file.filename}` }),
      })
    );

    if (emailChanged && !mockIdentity) {
      await MailService.sendVerificationCode({
        to: data.email,
        name: updatedUser.name,
        code: verificationCode,
      });
    }

    return updatedUser;
  }

  async delete(id, requester) {
    const user = await UserRepository.findById(id);
    if (!user) {
      throw new AppError('Usuário não encontrado', 404);
    }

    if (!isEnvironmentAdmin(requester) || Number(user.environmentId) !== Number(requester.environmentId)) {
      throw new AppError('Apenas o admin do ambiente pode deletar usuários', 403);
    }

    await UserRepository.delete(id);
    return true;
  }
}

module.exports = new UserService();
