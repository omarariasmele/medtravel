import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * name_normalized tiene un índice GIN pg_trgm (idx_org_trgm) para fuzzy
 * matching en el pipeline de deduplicación MTA-511 — no borrar
 * organizaciones, fusionarlas vía merged_into_id.
 */
@Entity({ schema: 'clinical', name: 'healthcare_organizations' })
export class HealthcareOrganizationEntity extends UuidBaseEntity {
  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'name_normalized', type: 'text', nullable: true })
  nameNormalized?: string;

  /** FK a params.catalog_values (dominio ORGANIZATION_TYPE). */
  @Column({ name: 'organization_type_id', type: 'uuid' })
  organizationTypeId: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId?: string;

  @Column({ name: 'state_province', type: 'text', nullable: true })
  stateProvince?: string;

  @Column({ type: 'text', nullable: true })
  city?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ type: 'numeric', precision: 10, scale: 8, nullable: true })
  latitude?: string;

  @Column({ type: 'numeric', precision: 11, scale: 8, nullable: true })
  longitude?: string;

  @Column({ type: 'text', nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  website?: string;

  /** Para verificación institucional (dominio de email corporativo). */
  @Column({ name: 'email_domain', type: 'text', nullable: true })
  emailDomain?: string;

  @Column({ name: 'sanitary_id', type: 'text', nullable: true })
  sanitaryId?: string;

  /** FK a params.catalog_values (dominio ORG_VERIFICATION_STATUS). */
  @Column({ name: 'verification_status_id', type: 'uuid' })
  verificationStatusId: string;

  @Column({ name: 'alias_names', type: 'text', array: true, nullable: true })
  aliasNames?: string[];

  @Column({ name: 'merged_into_id', type: 'uuid', nullable: true })
  mergedIntoId?: string;

  @Column({ name: 'mention_count', type: 'int', default: 0 })
  mentionCount: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
