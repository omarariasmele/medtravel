import { createResourceController } from '@common/database/create-resource-controller';

import { EMERGENCY_REGISTRY } from './emergency.registry';

export const EmergencyResourceController = createResourceController(
  'emergency',
  EMERGENCY_REGISTRY,
);
