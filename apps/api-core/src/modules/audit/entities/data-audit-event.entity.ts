import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

export type AuditOperation = 'INSERT' | 'UPDATE' | 'DELETE';

/**
 * Append-only (sin updated_at): triggers deny_audit_update/deny_audit_delete
 * en 001_audit.sql impiden UPDATE/DELETE a nivel de DB. No exponer un
 * método update/delete en el service de este módulo.
 */
@Entity({ schema: 'audit', name: 'data_audit_events' })
export class DataAuditEventEntity extends UuidBaseEntity {
  @Column({ name: 'table_schema', type: 'varchar', length: 50 })
  tableSchema: string;

  @Column({ name: 'table_name', type: 'varchar', length: 100 })
  tableName: string;

  @Column({ type: 'varchar', length: 10 })
  operation: AuditOperation;

  @Column({ name: 'row_id', type: 'uuid', nullable: true })
  rowId?: string;

  /** Con campos PII como '[REDACTED]' — ver audit.log_event() en 000_extensions.sql. */
  @Column({ name: 'old_data', type: 'jsonb', nullable: true })
  oldData?: Record<string, unknown>;

  @Column({ name: 'new_data', type: 'jsonb', nullable: true })
  newData?: Record<string, unknown>;

  @Column({ name: 'changed_fields', type: 'jsonb', nullable: true })
  changedFields?: Record<string, { from: unknown; to: unknown }>;

  @Column({ name: 'performed_by', type: 'uuid', nullable: true })
  performedBy?: string;

  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ name: 'session_id', type: 'text', nullable: true })
  sessionId?: string;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress?: string;

  @Column({ name: 'access_purpose', type: 'text', nullable: true })
  accessPurpose?: string;

  @Column({ name: 'authorization_context', type: 'text', nullable: true })
  authorizationContext?: string;

  @Column({ name: 'performed_at', type: 'timestamptz' })
  performedAt: Date;
}
