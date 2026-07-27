import { createResourceController } from '@common/database/create-resource-controller';

import { OPERATIONS_REGISTRY } from './operations.registry';

export const OperationsResourceController = createResourceController(
  'operations',
  OPERATIONS_REGISTRY,
);
