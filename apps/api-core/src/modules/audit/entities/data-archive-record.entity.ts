import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

export type ArchiveReason =
  | 'RETENTION_POLICY'
  | 'MEMBER_REQUEST'
  | 'TENANT_OFFBOARDING'
  | 'LEGAL_HOLD'
  | 'MANUAL';

@Entity({ schema: 'audit', name: 'data_archive_records' })
export class DataArchiveRecordEntity extends UuidBaseEntity {
  @Column({ name: 'table_schema', type: 'varchar', length: 50 })
  tableSchema: string;

  @Column({ name: 'table_name', type: 'varchar', length: 100 })
  tableName: string;

  @Column({ name: 'row_id', type: 'uuid' })
  rowId: string;

  /** Solo metadatos — el registro completo queda en la tabla original con deleted_at. */
  @Column({ name: 'archived_data_summary', type: 'jsonb' })
  archivedDataSummary: Record<string, unknown>;

  @Column({ name: 'archive_reason', type: 'varchar', length: 50 })
  archiveReason: ArchiveReason;

  /** FK a params.retention_policies. */
  @Column({ name: 'retention_policy_id', type: 'uuid', nullable: true })
  retentionPolicyId?: string;

  @Column({ name: 'archive_until', type: 'date', nullable: true })
  archiveUntil?: string;

  @Column({ name: 'archived_by', type: 'uuid', nullable: true })
  archivedBy?: string;

  @Column({ name: 'archived_at', type: 'timestamptz' })
  archivedAt: Date;
}
