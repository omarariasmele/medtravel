import { Injectable, Logger } from '@nestjs/common';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

interface FieldAnonymization {
  field: string;
  method: string;
}

interface AnonymizationJobRow {
  id: string;
  table_schema: string;
  table_name: string;
  row_id: string;
  fields_anonymized: FieldAnonymization[];
}

/**
 * Lógica real de audit.data_anonymization_jobs — separada del
 * @Processor de BullMQ (anonymization-jobs.processor.ts) para poder
 * probarla directamente (vía Nest testing module) sin necesitar Redis
 * corriendo. El processor de BullMQ es un wrapper delgado sobre
 * processJob().
 *
 * Usa audit.anonymize_field() (SECURITY DEFINER, ver
 * src/database/sql/proposed-anonymization-support.sql) para poder tocar
 * campos en tablas con RLS forzada (ej. core.persons) para un row_id
 * arbitrario — un job de background no tiene el app.current_person_id
 * de nadie, así que no puede pasar por el camino normal de RLS.
 */
@Injectable()
export class AnonymizationService {
  private readonly logger = new Logger(AnonymizationService.name);

  constructor(private readonly txManager: TenantTransactionManager) {}

  async processJob(jobId: string): Promise<void> {
    try {
      await this.txManager.runInTransaction(async (queryRunner) => {
        const rows = await queryRunner.query(
          `SELECT * FROM audit.data_anonymization_jobs WHERE id = $1 AND status = 'PENDING'`,
          [jobId],
        );
        const job: AnonymizationJobRow | undefined = rows[0];
        if (!job) {
          throw new Error(`Job ${jobId} no encontrado o ya no está PENDING`);
        }

        await queryRunner.query(
          `UPDATE audit.data_anonymization_jobs SET status = 'PROCESSING' WHERE id = $1`,
          [jobId],
        );

        for (const { field, method } of job.fields_anonymized) {
          await queryRunner.query(
            `SELECT audit.anonymize_field($1, $2, $3, $4, $5)`,
            [job.table_schema, job.table_name, field, job.row_id, method],
          );
        }

        await queryRunner.query(
          `UPDATE audit.data_anonymization_jobs
           SET status = 'COMPLETED', completed_at = NOW()
           WHERE id = $1`,
          [jobId],
        );
      });

      this.logger.log(`Job de anonimización ${jobId} completado`);
    } catch (error) {
      await this.markFailed(jobId, (error as Error).message);
      throw error;
    }
  }

  private async markFailed(jobId: string, message: string): Promise<void> {
    try {
      await this.txManager.runInTransaction((queryRunner) =>
        queryRunner.query(
          `UPDATE audit.data_anonymization_jobs
           SET status = 'FAILED', error_message = $2
           WHERE id = $1`,
          [jobId, message],
        ),
      );
    } catch (updateError) {
      this.logger.error(
        `No se pudo marcar el job ${jobId} como FAILED: ${(updateError as Error).message}`,
      );
    }
  }
}
