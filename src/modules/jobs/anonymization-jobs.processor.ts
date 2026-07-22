import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '@config/bullmq.config';

import { AnonymizationService } from './anonymization.service';

interface AnonymizationJobData {
  jobId: string;
}

/** Wrapper delgado sobre AnonymizationService — la lógica real vive ahí para poder testearla sin Redis. */
@Processor(QUEUE_NAMES.ANONYMIZATION_JOBS)
export class AnonymizationJobsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnonymizationJobsProcessor.name);

  constructor(private readonly anonymizationService: AnonymizationService) {
    super();
  }

  async process(job: Job<AnonymizationJobData>): Promise<void> {
    this.logger.debug(`Procesando job de anonimización ${job.data.jobId}`);
    await this.anonymizationService.processJob(job.data.jobId);
  }
}
