import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { RetentionPolicyEntity } from './retention-policy.entity';

@Entity({ schema: 'params', name: 'consent_purposes' })
@Index(['tenantId', 'code'], { unique: true })
export class ConsentPurposeEntity extends UuidBaseEntity {
  /** NULL = propósito global. FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ name: 'name_es', type: 'varchar', length: 200 })
  nameEs: string;

  @Column({ name: 'name_en', type: 'varchar', length: 200, nullable: true })
  nameEn?: string;

  @Column({ name: 'description_es', type: 'text' })
  descriptionEs: string;

  @Column({ name: 'description_en', type: 'text', nullable: true })
  descriptionEn?: string;

  @Column({ name: 'legal_basis', type: 'varchar', length: 50 })
  legalBasis: string;

  @Column({ name: 'data_categories', type: 'text', array: true })
  dataCategories: string[];

  @Column({ name: 'retention_policy_id', type: 'uuid', nullable: true })
  retentionPolicyId?: string;

  @ManyToOne(() => RetentionPolicyEntity)
  @JoinColumn({ name: 'retention_policy_id' })
  retentionPolicy?: RetentionPolicyEntity;

  @Column({ name: 'is_mandatory', type: 'boolean', default: false })
  isMandatory: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
