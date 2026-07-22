import { EntityTarget, ObjectLiteral } from 'typeorm';

import { TripEntity } from './entities/trip.entity';
import { TripDestinationEntity } from './entities/trip-destination.entity';
import { EmergencyCaseEntity } from './entities/emergency-case.entity';
import { CaseParticipantEntity } from './entities/case-participant.entity';
import { ChatChannelEntity } from './entities/chat-channel.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { MessageAttachmentEntity } from './entities/message-attachment.entity';
import { MessageReadEntity } from './entities/message-read.entity';
import { ChatTranslationEntity } from './entities/chat-translation.entity';
import { OperatorRoleEntity } from './entities/operator-role.entity';
import { OperatorEntity } from './entities/operator.entity';
import { OperatorPresenceEntity } from './entities/operator-presence.entity';
import { TenantAccessRequestEntity } from './entities/tenant-access-request.entity';

/**
 * Excluidos a propósito: case-status-history/case-location-history/
 * case-sla-log (system/trigger), case-medical-events (queda para cuando
 * se profundice el flujo de caso), operator-sessions/operator-audit-log
 * (análogo a security_sessions, no CRUD genérico), tenant-analytics-cache
 * (cache recalculado, no un recurso editable a mano).
 */
export const OPERATIONS_REGISTRY: Record<
  string,
  EntityTarget<ObjectLiteral>
> = {
  trips: TripEntity,
  'trip-destinations': TripDestinationEntity,
  'emergency-cases': EmergencyCaseEntity,
  'case-participants': CaseParticipantEntity,
  'chat-channels': ChatChannelEntity,
  'chat-messages': ChatMessageEntity,
  'message-attachments': MessageAttachmentEntity,
  'message-reads': MessageReadEntity,
  'chat-translations': ChatTranslationEntity,
  'operator-roles': OperatorRoleEntity,
  operators: OperatorEntity,
  'operator-presence': OperatorPresenceEntity,
  'tenant-access-requests': TenantAccessRequestEntity,
};
