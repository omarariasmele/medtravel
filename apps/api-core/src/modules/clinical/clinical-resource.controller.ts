import { createResourceController } from '@common/database/create-resource-controller';

import { CLINICAL_REGISTRY } from './clinical.registry';

export const ClinicalResourceController = createResourceController(
  'clinical',
  CLINICAL_REGISTRY,
);
