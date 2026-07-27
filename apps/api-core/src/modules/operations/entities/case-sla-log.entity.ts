import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { EmergencyCaseEntity } from './emergency-case.entity';

@Entity({ schema: 'operations', name: 'case_sla_log' })
export class CaseSlaLogEntity extends UuidBaseEntity {
  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @ManyToOne(() => EmergencyCaseEntity)
  @JoinColumn({ name: 'case_id' })
  case?: EmergencyCaseEntity;

  /** FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  /** FK a params.catalog_values (dominio SLA_TYPE). */
  @Column({ name: 'sla_type_id', type: 'uuid' })
  slaTypeId: string;

  @Column({ name: 'target_seconds', type: 'int' })
  targetSeconds: number;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ name: 'actual_seconds', type: 'int', nullable: true })
  actualSeconds?: number;

  @Column({ name: 'met_sla', type: 'boolean', nullable: true })
  metSla?: boolean;

  @Column({ name: 'breach_seconds', type: 'int', nullable: true })
  breachSeconds?: number;

  @Column({ name: 'breach_reason', type: 'text', nullable: true })
  breachReason?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
