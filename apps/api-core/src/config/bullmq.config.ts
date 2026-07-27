import { ConfigService } from '@nestjs/config';
import { SharedBullConfigurationFactory } from '@nestjs/bullmq';

export const buildBullRootOptions = (
  config: ConfigService,
): ReturnType<SharedBullConfigurationFactory['createSharedConfiguration']> => ({
  connection: {
    host: config.get<string>('REDIS_HOST'),
    port: config.get<number>('REDIS_PORT'),
    password: config.get<string>('REDIS_PASSWORD') || undefined,
  },
});

/** Nombres de cola — un job real (processor) queda pendiente por cola, ver src/modules/jobs. */
export const QUEUE_NAMES = {
  DOCUMENT_AI_PROCESSING: 'document-ai-processing',
  ANONYMIZATION_JOBS: 'anonymization-jobs',
  ACCESS_NOTIFICATIONS: 'access-notifications',
  COVERAGE_SYNC: 'coverage-sync',
} as const;
