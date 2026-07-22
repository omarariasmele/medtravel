import { createResourceController } from '@common/database/create-resource-controller';

import { AUDIT_REGISTRY } from './audit.registry';

export const AuditResourceController = createResourceController(
  'audit',
  AUDIT_REGISTRY,
);
