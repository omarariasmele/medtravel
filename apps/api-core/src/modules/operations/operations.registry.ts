import { EntityTarget, ObjectLiteral } from 'typeorm';

import { TripEntity } from './entities/trip.entity';
import { TripDestinationEntity } from './entities/trip-destination.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { OperatorEntity } from './entities/operator.entity';
import { OperatorRoleEntity } from './entities/operator-role.entity';
import { CaseMedicalEventEntity } from './entities/case-medical-event.entity';

/**
 * Excluidos a propósito: case-status-history/case-location-history/
 * case-sla-log (system/trigger), operator-sessions/operator-audit-log
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
 * operator-roles/operators ya tienen operators_tenant_access/
 * operator_roles_tenant_access (proposed-tenant-access-model.sql, gap #8
 * resuelto) — se vuelven a exponer acá para lectura/edición. El ALTA de
 * un operador nuevo NO pasa por el POST genérico de acá (necesita crear
 * el core.users/credentials asociado primero) — ver
 * operators-registration.controller.ts. operator-presence sigue afuera:
 * es estado efímero que actualiza el propio operador vía otro flujo, no
 * un recurso para administrar a mano.
 *
 * case-medical-events se agrega para el historial/bitácora del caso
 * (notas de cada operador interviniente, por fecha/hora) — tenía GRANT
 * pero nunca RLS propia; se le agregó case_medical_events_access (mismo
 * criterio que cases_access: tenant del caso, o el propio viajero) antes
 * de exponerla acá (ver proposed-case-medical-events-rls.sql). Es
 * append-only por diseño (solo SELECT/INSERT en el GRANT), igual que
 * case_status_history.
 */
export const OPERATIONS_REGISTRY: Record<
  string,
  EntityTarget<ObjectLiteral>
> = {
  trips: TripEntity,
  'trip-destinations': TripDestinationEntity,
  'chat-messages': ChatMessageEntity,
  operators: OperatorEntity,
  'operator-roles': OperatorRoleEntity,
  'case-medical-events': CaseMedicalEventEntity,
};
