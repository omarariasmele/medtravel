import { Column, Entity, Index } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';
import { LifecycleStatus } from './catalog-value.entity';

export type FeatureFlagType = 'BOOLEAN' | 'STRING' | 'INTEGER' | 'JSON';

@Entity({ schema: 'params', name: 'feature_flags' })
@Index(['tenantId', 'flagKey'], { unique: true })
export class FeatureFlagEntity extends UuidBaseEntity {
  /** NULL = flag global. FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ name: 'flag_key', type: 'varchar', length: 200 })
  flagKey: string;

  @Column({ name: 'flag_type', type: 'varchar', length: 20 })
  flagType: FeatureFlagType;

  @Column({ name: 'default_value', type: 'jsonb' })
  defaultValue: unknown;

  @Column({ name: 'description_es', type: 'text', nullable: true })
  descriptionEs?: string;

  @Column({ name: 'is_sensitive', type: 'boolean', default: false })
  isSensitive: boolean;

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

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
