import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { TenantEntity } from './tenant.entity';

@Entity({ schema: 'core', name: 'partner_member_records' })
@Index(['tenantId', 'partnerRefId'], { unique: true })
export class PartnerMemberRecordEntity extends UuidBaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => TenantEntity)
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  @Column({ name: 'partner_ref_id', type: 'varchar', length: 100 })
  partnerRefId: string;

  @Column({ name: 'raw_name', type: 'text', nullable: true })
  rawName?: string;

  @Column({ name: 'raw_doc_type', type: 'varchar', length: 50, nullable: true })
  rawDocType?: string;

  /** Dato tal cual lo envía el partner, sin cifrar. */
  @Column({ name: 'raw_doc_number', type: 'text', nullable: true })
  rawDocNumber?: string;

  @Column({ name: 'policy_number', type: 'varchar', length: 100 })
  policyNumber: string;

  @Column({ name: 'plan_code', type: 'varchar', length: 100, nullable: true })
  planCode?: string;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_until', type: 'date' })
  validUntil: string;

  /** FK a params.catalog_values (dominio IMPORT_STATUS). */
  @Column({ name: 'import_status_id', type: 'uuid' })
  importStatusId: string;

  @Column({ name: 'import_batch_id', type: 'uuid', nullable: true })
  importBatchId?: string;

  @Column({ name: 'imported_at', type: 'timestamptz' })
  importedAt: Date;
}
