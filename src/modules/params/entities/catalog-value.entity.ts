import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { DomainCatalogEntity } from './domain-catalog.entity';

export type LifecycleStatus = 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'RETIRED';

@Entity({ schema: 'params', name: 'catalog_values' })
@Index(['domainId', 'tenantId', 'code'], { unique: true })
export class CatalogValueEntity extends UuidBaseEntity {
  @Column({ name: 'domain_id', type: 'uuid' })
  domainId: string;

  @ManyToOne(() => DomainCatalogEntity)
  @JoinColumn({ name: 'domain_id' })
  domain?: DomainCatalogEntity;

  /** NULL = valor global, no específico de un tenant. FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ name: 'label_es', type: 'varchar', length: 200 })
  labelEs: string;

  @Column({ name: 'label_en', type: 'varchar', length: 200, nullable: true })
  labelEn?: string;

  @Column({ name: 'label_pt', type: 'varchar', length: 200, nullable: true })
  labelPt?: string;

  @Column({ name: 'label_fr', type: 'varchar', length: 200, nullable: true })
  labelFr?: string;

  @Column({ name: 'description_es', type: 'text', nullable: true })
  descriptionEs?: string;

  @Column({ name: 'description_en', type: 'text', nullable: true })
  descriptionEn?: string;

  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder: number;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom?: string;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil?: string;

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

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
