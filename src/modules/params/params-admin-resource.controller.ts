import { createResourceController } from '@common/database/create-resource-controller';

import { PARAMS_REGISTRY } from './params.registry';

export const ParamsAdminResourceController = createResourceController(
  'params/admin',
  PARAMS_REGISTRY,
);
