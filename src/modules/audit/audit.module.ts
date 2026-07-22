import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DataAuditEventEntity } from './entities/data-audit-event.entity';
import { BreakGlassGrantEntity } from './entities/break-glass-grant.entity';
import { DataArchiveRecordEntity } from './entities/data-archive-record.entity';
import { DataAnonymizationJobEntity } from './entities/data-anonymization-job.entity';
import { DataSuppressionRequestEntity } from './entities/data-suppression-request.entity';
import { AccessNotificationEntity } from './entities/access-notification.entity';

import { BreakGlassService } from './break-glass.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DataAuditEventEntity,
      BreakGlassGrantEntity,
      DataArchiveRecordEntity,
      DataAnonymizationJobEntity,
      DataSuppressionRequestEntity,
      AccessNotificationEntity,
    ]),
  ],
  providers: [BreakGlassService],
  exports: [TypeOrmModule, BreakGlassService],
})
export class AuditModule {}
