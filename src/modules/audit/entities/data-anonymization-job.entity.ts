import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

export type AnonymizationMethod =
  | 'PSEUDONYMIZATION'
  | 'HASH_IRREVERSIBLE'
  | 'REDACT'
  | 'GENERALIZATION'
  | 'SUPPRESSION';

export type AnonymizationJobStatus =
  'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

/** Consumida por la cola BullMQ `anonymization-jobs` (ver src/modules/jobs). */
@Entity({ schema: 'audit', name: 'data_anonymization_jobs' })
export class DataAnonymizationJobEntity extends UuidBaseEntity {
  @Column({ name: 'table_schema', type: 'varchar', length: 50 })
  tableSchema: string;

  @Column({ name: 'table_name', type: 'varchar', length: 100 })
  tableName: string;

  @Column({ name: 'row_id', type: 'uuid' })
  rowId: string;

  /** FK a params.retention_policies. */
  @Column({ name: 'retention_policy_id', type: 'uuid', nullable: true })
  retentionPolicyId?: string;

  @Column({ name: 'fields_anonymized', type: 'jsonb' })
  fieldsAnonymized: Array<{ field: string; method: string }>;

  @Column({ type: 'varchar', length: 20 })
  method: AnonymizationMethod;

  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: AnonymizationJobStatus;

  @Column({ name: 'trigger_reason', type: 'varchar', length: 50 })
  triggerReason: string;

  @Column({ name: 'scheduled_at', type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'executed_by', type: 'uuid', nullable: true })
  executedBy?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
