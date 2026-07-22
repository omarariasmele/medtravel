import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '@config/bullmq.config';

/** Verifica coverage.travel_assistance_enrollments contra la API del partner — integración pendiente. */
@Processor(QUEUE_NAMES.COVERAGE_SYNC)
export class CoverageSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CoverageSyncProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.debug(
      `TODO: sincronizar cobertura con el partner — job ${job.id}`,
    );
  }
}
