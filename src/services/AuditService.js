const { AuditLog } = require('../models');

class AuditService {
  record({ actorId, action, resourceType, resourceId, environmentId = null, summary, metadata = null }, transaction = null) {
    const safeMetadata = metadata ? { ...metadata } : null;
    if (safeMetadata) {
      delete safeMetadata.cpf;
      delete safeMetadata.password;
      delete safeMetadata.token;
    }
    return AuditLog.create({ actorId, action, resourceType, resourceId: resourceId ? String(resourceId) : null, environmentId, summary, metadata: safeMetadata }, { transaction });
  }
}

module.exports = new AuditService();
