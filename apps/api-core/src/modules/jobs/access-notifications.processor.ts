import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QUEUE_NAMES } from '@config/bullmq.config';

/** Fan-out de audit.access_notifications a push/email/sms — integraciones reales pendientes. */
@Processor(QUEUE_NAMES.ACCESS_NOTIFICATIONS)
export class AccessNotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(AccessNotificationsProcessor.name);

  async process(job: Job): Promise<void> {
    this.logger.debug(`TODO: despachar notificación de acceso — job ${job.id}`);
  }
}
