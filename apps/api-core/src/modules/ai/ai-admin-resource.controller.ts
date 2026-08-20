import { createResourceController } from '@common/database/create-resource-controller';
import { ConfigAccessGuard } from '@common/auth/config-access.guard';

import { AI_REGISTRY } from './ai.registry';

/**
 * CRUD del guion del modelo Estructurado (ai.interview_questions) —
 * gateado con ConfigAccessGuard, mismo criterio que
 * params-admin-resource.controller.ts: es configuración global de
 * plataforma, no dato de un tenant/viajero.
 */
export const AiAdminResourceController = createResourceController(
  'ai/admin',
  AI_REGISTRY,
  [ConfigAccessGuard],
);
