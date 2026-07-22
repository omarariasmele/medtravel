import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '@config/bullmq.config';

/** Encola clinical.document_ai_processing — lógica real de extracción/IA pendiente. */
@Processor(QUEUE_NAMES.DOCUMENT_AI_PROCESSING)
export class DocumentAiProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentAiProcessingProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.debug(`TODO: procesar documento con IA — job ${job.id}`);
  }
}
