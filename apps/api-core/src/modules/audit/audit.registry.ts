import { EntityTarget, ObjectLiteral } from 'typeorm';

import { DataSuppressionRequestEntity } from './entities/data-suppression-request.entity';
import { AccessNotificationEntity } from './entities/access-notification.entity';

/**
 * Excluidos a propósito: data-audit-events (log inmutable),
 * break-glass-grants (tiene BreakGlassService con las funciones
 * controladas request/approve/revoke_break_glass — un CRUD genérico ahí
 * sería reabrir el agujero de seguridad que C3 del schema cerró),
 * data-archive-records/data-anonymization-jobs (system/BullMQ).
 */
export const AUDIT_REGISTRY: Record<string, EntityTarget<ObjectLiteral>> = {
  'data-suppression-requests': DataSuppressionRequestEntity,
  'access-notifications': AccessNotificationEntity,
};
