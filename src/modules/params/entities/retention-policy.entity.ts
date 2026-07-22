import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';
import { LifecycleStatus } from './catalog-value.entity';

export type RetentionExpiryAction =
  'DELETE' | 'ANONYMIZE' | 'ARCHIVE' | 'MANUAL_REVIEW';

@Entity({ schema: 'params', name: 'retention_policies' })
export class RetentionPolicyEntity extends UuidBaseEntity {
  /** NULL = política global. FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType: string;

  @Column({ type: 'varchar', length: 10 })
  jurisdiction: string;

  @Column({ type: 'varchar', length: 20 })
  regulation: string;

  @Column({ name: 'retention_days', type: 'int' })
  retentionDays: number;

  @Column({ name: 'archive_after_days', type: 'int', nullable: true })
  archiveAfterDays?: number;

  @Column({ name: 'anonymize_after_days', type: 'int', nullable: true })
  anonymizeAfterDays?: number;

  @Column({ name: 'action_on_expiry', type: 'varchar', length: 20 })
  actionOnExpiry: RetentionExpiryAction;

  @Column({ name: 'legal_basis', type: 'text', nullable: true })
  legalBasis?: string;

  @Column({
    name: 'lifecycle_status',
    type: 'varchar',
    length: 20,
    default: 'ACTIVE',
  })
  lifecycleStatus: LifecycleStatus;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
