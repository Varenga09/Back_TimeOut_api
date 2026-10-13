require('dotenv').config();

const PlatformAdminService = require('../src/services/PlatformAdminService');
const { formatResult } = require('./platform-admin-command');

function parseRequest(request) {
  const match = /^TIMEOUT_PRODUCTION:([^:\s]+@[^:\s]+)$/.exec(String(request || '').trim());
  if (!match) throw new Error('Solicitação de acesso interno inválida');
  return { confirmation: 'TIMEOUT_PRODUCTION', email: match[1] };
}

async function run({ env = process.env, logger = console, service = PlatformAdminService } = {}) {
  if (!env.PLATFORM_ADMIN_BOOTSTRAP_REQUEST) return { skipped: true };

  const request = parseRequest(env.PLATFORM_ADMIN_BOOTSTRAP_REQUEST);
  const options = {
    ...request,
    nodeEnv: env.NODE_ENV,
    configuredSecret: env.PLATFORM_ADMIN_BOOTSTRAP_SECRET,
    providedSecret: env.PLATFORM_ADMIN_BOOTSTRAP_INPUT,
  };
  delete env.PLATFORM_ADMIN_BOOTSTRAP_INPUT;

  try {
    const account = await service.inspectAccount(options);
    logger.log(formatResult('status', account));
    if (!account.emailVerified) {
      logger.warn('Promoção não executada: o e-mail da conta ainda não foi confirmado');
      return { skipped: true, emailVerified: false };
    }

    const result = await service.grant(options);
    logger.log(formatResult('grant', result));
    return result;
  } catch (error) {
    if (error.statusCode === 404) {
      logger.warn('Promoção não executada: usuário não encontrado pelo cadastro normal');
      return { skipped: true, accountFound: false };
    }
    throw error;
  }
}

if (require.main === module) {
  run().catch(() => {
    console.error('Configuração de promoção interna inválida; a conta não foi alterada');
    process.exitCode = 1;
  });
}

module.exports = { run, parseRequest };
