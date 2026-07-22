import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { OperatorEntity } from './operator.entity';
import { EmergencyCaseEntity } from './emergency-case.entity';
import { OperatorSessionEntity } from './operator-session.entity';

/** Inmutable — auditoría propia de acciones de operadores (distinta de audit.data_audit_events). */
@Entity({ schema: 'operations', name: 'operator_audit_log' })
export class OperatorAuditLogEntity extends UuidBaseEntity {
  @Column({ name: 'operator_id', type: 'uuid' })
  operatorId: string;

  @ManyToOne(() => OperatorEntity)
  @JoinColumn({ name: 'operator_id' })
  operator?: OperatorEntity;

  /** FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  /** FK a params.catalog_values (dominio OPERATOR_ACTION_TYPE). */
  @Column({ name: 'action_type_id', type: 'uuid' })
  actionTypeId: string;

  /** FK a params.catalog_values (dominio OPERATOR_RESOURCE_TYPE). */
  @Column({ name: 'resource_type_id', type: 'uuid', nullable: true })
  resourceTypeId?: string;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId?: string;

  @Column({ name: 'resource_preview', type: 'text', nullable: true })
  resourcePreview?: string;

  @Column({ name: 'case_id', type: 'uuid', nullable: true })
  caseId?: string;

  @ManyToOne(() => EmergencyCaseEntity)
  @JoinColumn({ name: 'case_id' })
  case?: EmergencyCaseEntity;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @Column({ name: 'session_id', type: 'uuid', nullable: true })
  sessionId?: string;

  @ManyToOne(() => OperatorSessionEntity)
  @JoinColumn({ name: 'session_id' })
  session?: OperatorSessionEntity;

  @Column({ type: 'boolean', default: true })
  success: boolean;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'data_before', type: 'jsonb', nullable: true })
  dataBefore?: Record<string, unknown>;

  @Column({ name: 'data_after', type: 'jsonb', nullable: true })
  dataAfter?: Record<string, unknown>;

  @Column({ name: 'performed_at', type: 'timestamptz' })
  performedAt: Date;
}
