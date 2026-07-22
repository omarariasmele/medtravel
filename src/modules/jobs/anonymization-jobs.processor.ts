import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '@config/bullmq.config';

/** Ejecuta audit.data_anonymization_jobs pendientes — lógica real de anonymización pendiente. */
@Processor(QUEUE_NAMES.ANONYMIZATION_JOBS)
export class AnonymizationJobsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnonymizationJobsProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.debug(`TODO: ejecutar job de anonimización — job ${job.id}`);
  }
}
