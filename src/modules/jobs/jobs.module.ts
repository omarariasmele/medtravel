import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { buildBullRootOptions, QUEUE_NAMES } from '@config/bullmq.config';

import { DocumentAiProcessingProcessor } from './document-ai-processing.processor';
import { AnonymizationJobsProcessor } from './anonymization-jobs.processor';
import { AccessNotificationsProcessor } from './access-notifications.processor';
import { CoverageSyncProcessor } from './coverage-sync.processor';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: buildBullRootOptions,
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.DOCUMENT_AI_PROCESSING },
      { name: QUEUE_NAMES.ANONYMIZATION_JOBS },
      { name: QUEUE_NAMES.ACCESS_NOTIFICATIONS },
      { name: QUEUE_NAMES.COVERAGE_SYNC },
    ),
  ],
  providers: [
    DocumentAiProcessingProcessor,
    AnonymizationJobsProcessor,
    AccessNotificationsProcessor,
    CoverageSyncProcessor,
  ],
  exports: [BullModule],
})
export class JobsModule {}
