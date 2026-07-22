import { Column, Entity, Index } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * RLS: analytics_tenant — solo el propio tenant ve su cache. Diseñado para
 * el portal B2B sin exponer PII cruda: display_name son iniciales,
 * age_range es un rango ('31-45'), nunca fecha de nacimiento exacta.
 */
@Entity({ schema: 'operations', name: 'tenant_analytics_cache' })
@Index(['tenantId', 'memberId'], { unique: true })
export class TenantAnalyticsCacheEntity extends UuidBaseEntity {
  /** FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @Column({
    name: 'policy_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  policyNumber?: string;

  @Column({ name: 'display_name', type: 'text', nullable: true })
  displayName?: string;

  @Column({ name: 'plan_code', type: 'varchar', length: 100, nullable: true })
  planCode?: string;

  /** FK a params.catalog_values (dominio APP_STATUS). */
  @Column({ name: 'app_status_id', type: 'uuid', nullable: true })
  appStatusId?: string;

  @Column({
    name: 'history_completeness_pct',
    type: 'smallint',
    nullable: true,
  })
  historyCompletenessPct?: number;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'residence_country_id', type: 'uuid', nullable: true })
  residenceCountryId?: string;

  @Column({ name: 'age_range', type: 'varchar', length: 10, nullable: true })
  ageRange?: string;

  @Column({ type: 'char', length: 1, nullable: true })
  gender?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'last_trip_country_id', type: 'uuid', nullable: true })
  lastTripCountryId?: string;

  @Column({ name: 'last_trip_date', type: 'date', nullable: true })
  lastTripDate?: string;

  @Column({ name: 'active_case_id', type: 'uuid', nullable: true })
  activeCaseId?: string;

  @Column({ name: 'last_sync_at', type: 'timestamptz' })
  lastSyncAt: Date;
}
