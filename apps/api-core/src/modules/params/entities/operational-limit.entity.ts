import { Column, Entity, Index } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';
import { LifecycleStatus } from './catalog-value.entity';

/**
 * B9: TTLs de tokens, SLA y otros límites operativos — se leen de acá en
 * runtime, no van hardcodeados en la app (ver operations.fill_sla_target,
 * audit.enforce_break_glass_duration en 000_extensions.sql).
 */
@Entity({ schema: 'params', name: 'operational_limits' })
@Index(['tenantId', 'limitKey'], { unique: true })
export class OperationalLimitEntity extends UuidBaseEntity {
  /** NULL = límite global. FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ name: 'limit_key', type: 'varchar', length: 200 })
  limitKey: string;

  @Column({ name: 'limit_value', type: 'int' })
  limitValue: number;

  @Column({ type: 'varchar', length: 20 })
  unit: string;

  @Column({ name: 'description_es', type: 'text', nullable: true })
  descriptionEs?: string;

  @Column({ name: 'requires_approval', type: 'boolean', default: false })
  requiresApproval: boolean;

  @Column({
    name: 'lifecycle_status',
    type: 'varchar',
    length: 20,
    default: 'ACTIVE',
  })
  lifecycleStatus: LifecycleStatus;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
