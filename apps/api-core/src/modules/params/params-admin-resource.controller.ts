import { createResourceController } from '@common/database/create-resource-controller';
import { ConfigAccessGuard } from '@common/auth/config-access.guard';

import { PARAMS_REGISTRY } from './params.registry';

/**
 * Gateada con ConfigAccessGuard (canManageConfig) — antes de esto
 * cualquier operador autenticado podía leer/escribir cualquiera de estas
 * ~20 tablas de configuración global (feature-flags, workflow-definitions,
 * etc.), ninguna tiene RLS propia por tenant.
 */
export const ParamsAdminResourceController = createResourceController(
  'params/admin',
  PARAMS_REGISTRY,
  [ConfigAccessGuard],
);
