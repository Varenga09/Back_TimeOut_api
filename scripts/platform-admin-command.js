require('dotenv').config();

const PlatformAdminService = require('../src/services/PlatformAdminService');

function parseArguments(argv) {
  return argv.reduce((result, argument) => {
    const match = argument.match(/^--([^=]+)=(.*)$/);
    if (match) result[match[1]] = match[2];
    return result;
  }, {});
}

function formatResult(action, account) {
  return JSON.stringify({
    action,
    email: account.email,
    role: account.role,
    emailVerified: account.emailVerified,
    ...(action === 'grant' && {
      changed: account.changed,
      sessionsInvalidated: account.sessionsInvalidated,
    }),
  }, null, 2);
}

async function run({ argv = process.argv.slice(2), env = process.env, logger = console } = {}) {
  const [action] = argv;
  if (!['status', 'grant'].includes(action)) {
    throw new Error('Ação inválida. Use status ou grant');
  }

  const args = parseArguments(argv.slice(1));
  const common = {
    email: args.email,
    nodeEnv: env.NODE_ENV,
    confirmation: args['confirm-production'],
    configuredSecret: env.PLATFORM_ADMIN_BOOTSTRAP_SECRET,
    providedSecret: env.PLATFORM_ADMIN_BOOTSTRAP_INPUT,
  };

  // Remove a cópia transitória antes de qualquer acesso ao banco ou geração de log.
  delete env.PLATFORM_ADMIN_BOOTSTRAP_INPUT;
  const account = action === 'status'
    ? await PlatformAdminService.inspectAccount(common)
    : await PlatformAdminService.grant(common);
  logger.log(formatResult(action, account));
  return account;
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error?.message || 'Falha ao executar o comando administrativo');
    process.exitCode = 1;
  });
}

module.exports = { run, parseArguments, formatResult };
