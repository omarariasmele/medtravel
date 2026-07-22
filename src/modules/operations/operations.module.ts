import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TripEntity } from './entities/trip.entity';
import { TripDestinationEntity } from './entities/trip-destination.entity';
import { EmergencyCaseEntity } from './entities/emergency-case.entity';
import { CaseParticipantEntity } from './entities/case-participant.entity';
import { CaseStatusHistoryEntity } from './entities/case-status-history.entity';
import { CaseLocationHistoryEntity } from './entities/case-location-history.entity';
import { CaseMedicalEventEntity } from './entities/case-medical-event.entity';
import { CaseSlaLogEntity } from './entities/case-sla-log.entity';
import { ChatChannelEntity } from './entities/chat-channel.entity';
import { ChatMessageEntity } from './entities/chat-message.entity';
import { MessageAttachmentEntity } from './entities/message-attachment.entity';
import { MessageReadEntity } from './entities/message-read.entity';
import { ChatTranslationEntity } from './entities/chat-translation.entity';
import { OperatorRoleEntity } from './entities/operator-role.entity';
import { OperatorEntity } from './entities/operator.entity';
import { OperatorSessionEntity } from './entities/operator-session.entity';
import { OperatorPresenceEntity } from './entities/operator-presence.entity';
import { OperatorAuditLogEntity } from './entities/operator-audit-log.entity';
import { TenantAnalyticsCacheEntity } from './entities/tenant-analytics-cache.entity';
import { TenantAccessRequestEntity } from './entities/tenant-access-request.entity';
import { OperationsResourceController } from './operations-resource.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TripEntity,
      TripDestinationEntity,
      EmergencyCaseEntity,
      CaseParticipantEntity,
      CaseStatusHistoryEntity,
      CaseLocationHistoryEntity,
      CaseMedicalEventEntity,
      CaseSlaLogEntity,
      ChatChannelEntity,
      ChatMessageEntity,
      MessageAttachmentEntity,
      MessageReadEntity,
      ChatTranslationEntity,
      OperatorRoleEntity,
      OperatorEntity,
      OperatorSessionEntity,
      OperatorPresenceEntity,
      OperatorAuditLogEntity,
      TenantAnalyticsCacheEntity,
      TenantAccessRequestEntity,
    ]),
  ],
  controllers: [OperationsResourceController],
  exports: [TypeOrmModule],
})
export class OperationsModule {}
