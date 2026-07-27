import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { HealthcareOrganizationEntity } from './healthcare-organization.entity';

/** Pipeline de deduplicación MTA-511 (cambio #5) — reemplaza la creación automática por menciones. */
@Entity({ schema: 'clinical', name: 'organization_candidates' })
export class OrganizationCandidateEntity extends UuidBaseEntity {
  @Column({ name: 'raw_name', type: 'text' })
  rawName: string;

  @Column({ name: 'raw_address', type: 'text', nullable: true })
  rawAddress?: string;

  @Column({ name: 'raw_city', type: 'text', nullable: true })
  rawCity?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'raw_country_id', type: 'uuid', nullable: true })
  rawCountryId?: string;

  @Column({ name: 'raw_phone', type: 'text', nullable: true })
  rawPhone?: string;

  @Column({ name: 'raw_domain', type: 'text', nullable: true })
  rawDomain?: string;

  @Column({ name: 'raw_identifiers', type: 'jsonb', default: {} })
  rawIdentifiers: Record<string, unknown>;

  @Column({ name: 'existing_org_id', type: 'uuid', nullable: true })
  existingOrgId?: string;

  @ManyToOne(() => HealthcareOrganizationEntity)
  @JoinColumn({ name: 'existing_org_id' })
  existingOrg?: HealthcareOrganizationEntity;

  @Column({
    name: 'confidence_score',
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
  })
  confidenceScore?: string;

  @Column({ name: 'matching_signals', type: 'jsonb', default: {} })
  matchingSignals: Record<string, unknown>;

  /** FK a params.catalog_values (dominio DEDUP_PIPELINE_STATUS). */
  @Column({ name: 'pipeline_status_id', type: 'uuid' })
  pipelineStatusId: string;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt?: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
