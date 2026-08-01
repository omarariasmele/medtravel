import { createResourceController } from '@common/database/create-resource-controller';

import { COVERAGE_REGISTRY } from './coverage.registry';

export const CoverageResourceController = createResourceController(
  'coverage',
  COVERAGE_REGISTRY,
);
