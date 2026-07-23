import { EntityTarget, ObjectLiteral } from 'typeorm';

import { TripEntity } from './entities/trip.entity';
import { TripDestinationEntity } from './entities/trip-destination.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';

/**
 * Excluidos a propósito: case-status-history/case-location-history/
 * case-sla-log (system/trigger), case-medical-events (queda para cuando
 * se profundice el flujo de caso), operator-sessions/operator-audit-log
 * (análogo a security_sessions, no CRUD genérico), tenant-analytics-cache
 * (cache recalculado, no un recurso editable a mano). emergency-cases
 * también queda afuera de este registro genérico: tiene su propio
 * EmergencyCasesController (ver emergency-cases.controller.ts) para poder
 * emitir case_update por Socket.io después de cada PATCH.
 *
 * case-participants/chat-channels/message-attachments/message-reads/
 * chat-translations/tenant-access-requests salieron del registro (gap #8,
 * ver SCHEMA_GAPS.md): ninguna tiene RLS propia en el schema aprobado,
 * así que exponerlas por CRUD genérico dejaba leer/escribir la lista de
 * participantes o los archivos adjuntos de CUALQUIER caso a cualquier
 * usuario autenticado, sin pasar por la verificación de membresía real
 * que sí tiene el gateway de Socket.io (ver events.gateway.ts). Quedan
 * pendientes de una política RLS propia antes de volver a exponerse acá.
 * chat-messages SÍ se queda: msg_select/msg_insert (007_operations.sql)
 * ya validan membresía real vía case_participants dentro de la propia
 * política RLS, es justo el mismo control que usa el gateway.
 *
 * operator-roles/operators/operator-presence también salieron (mismo
 * gap #8): sin RLS, cualquier usuario autenticado (no solo otros
 * operadores) podía leer y ACTUALIZAR el directorio de operadores de
 * cualquier tenant, no solo el propio. Necesitan una política tenant_id
 * = app.current_tenant_id (mismo patrón que analytics_tenant/cases_access)
 * antes de volver a exponerse acá.
 */
export const OPERATIONS_REGISTRY: Record<
  string,
  EntityTarget<ObjectLiteral>
> = {
  trips: TripEntity,
  'trip-destinations': TripDestinationEntity,
  'chat-messages': ChatMessageEntity,
};
