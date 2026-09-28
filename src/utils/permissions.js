function isEnvironmentAdmin(user) {
  return ['admin', 'environment_admin'].includes(user?.role);
}

function isPlatformAdmin(user) {
  return user?.role === 'platform_admin';
}

function isAdmin(user) {
  return isEnvironmentAdmin(user) || isPlatformAdmin(user);
}

module.exports = { isAdmin, isEnvironmentAdmin, isPlatformAdmin };
