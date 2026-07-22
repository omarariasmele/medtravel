import { createResourceController } from '@common/database/create-resource-controller';

import { IDENTITY_REGISTRY } from './identity.registry';

export const IdentityResourceController = createResourceController(
  'identity',
  IDENTITY_REGISTRY,
);
