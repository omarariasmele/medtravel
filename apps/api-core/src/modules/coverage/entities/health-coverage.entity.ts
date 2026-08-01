import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * RLS (C2, 004_coverage.sql): hc_select exige consentimiento explícito
 * (consent_purposes.code = 'HEALTH_COVERAGE_ACCESS') para que un tenant vea
 * la cobertura de un member — no alcanza con pertenecer al tenant. hc_update
 * e hc_insert solo permiten al propio titular; hc_no_delete bloquea DELETE
 * siempre. No exponer un delete() en el servicio de este módulo.
 */
@Entity({ schema: 'coverage', name: 'health_coverages' })
export class HealthCoverageEntity extends UuidBaseEntity {
  /** FK a core.members. Nullable — ver person_id: una obra social no depende de estar afiliado a una empresa de asistencia al viajero. */
  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  /** FK a core.persons. Camino directo, independiente de member_id/tenant. */
  @Column({ name: 'person_id', type: 'uuid', nullable: true })
  personId?: string;

  @Column({ name: 'coverage_name', type: 'varchar', length: 200 })
  coverageName: string;

  /** FK a params.catalog_values (dominio HEALTH_COVERAGE_TYPE). */
  @Column({ name: 'coverage_type_id', type: 'uuid' })
  coverageTypeId: string;

  @Column({ name: 'provider_name', type: 'varchar', length: 200 })
  providerName: string;

  /** FK a coverage.healthcare_providers. */
  @Column({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId?: string;

  /** FK a coverage.healthcare_plans. */
  @Column({ name: 'plan_id', type: 'uuid', nullable: true })
  planId?: string;

  /** Quién contrata la cobertura, si no es el propio viajero (ej. el empleador). */
  @Column({
    name: 'contractor_name',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  contractorName?: string;

  @Column({
    name: 'policy_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  policyNumber?: string;

  @Column({
    name: 'member_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  memberNumber?: string;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom?: string;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil?: string;

  @Column({
    name: 'timezone_rule',
    type: 'varchar',
    length: 50,
    default: 'UTC',
  })
  timezoneRule: string;

  /** FK a params.catalog_values (dominio HEALTH_COVERAGE_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId?: string;

  @Column({ name: 'last_verified_at', type: 'timestamptz', nullable: true })
  lastVerifiedAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
