import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { AssistancePlanEntity } from './assistance-plan.entity';
import { CoverageSponsorEntity } from './coverage-sponsor.entity';

export type StatusAuthority =
  'PARTNER_API' | 'LOCAL_RECORD' | 'MEMBER_DECLARED';
export type CoverageActivationMode =
  'TRIP_REQUIRED' | 'AUTOMATIC' | 'DECLARED_TRAVEL';

/**
 * RLS (coverage.travel_assistance_enrollments, 004_coverage.sql):
 * enrollments_access — tenant ve los suyos, titular (person) ve los propios.
 */
@Entity({ schema: 'coverage', name: 'travel_assistance_enrollments' })
export class TravelAssistanceEnrollmentEntity extends UuidBaseEntity {
  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  /** FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @ManyToOne(() => AssistancePlanEntity)
  @JoinColumn({ name: 'plan_id' })
  plan?: AssistancePlanEntity;

  @Column({ name: 'sponsor_id', type: 'uuid', nullable: true })
  sponsorId?: string;

  @ManyToOne(() => CoverageSponsorEntity)
  @JoinColumn({ name: 'sponsor_id' })
  sponsor?: CoverageSponsorEntity;

  @Column({ name: 'policy_number', type: 'varchar', length: 100 })
  policyNumber: string;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_until', type: 'date' })
  validUntil: string;

  /** La cobertura expira al final del día en esta zona horaria (B11). */
  @Column({
    name: 'timezone_rule',
    type: 'varchar',
    length: 50,
    default: 'UTC',
  })
  timezoneRule: string;

  @Column({
    name: 'territory_scope',
    type: 'text',
    array: true,
    default: ['WORLDWIDE'],
  })
  territoryScope: string[];

  @Column({
    name: 'status_authority',
    type: 'varchar',
    length: 20,
    default: 'LOCAL_RECORD',
  })
  statusAuthority: StatusAuthority;

  /** FK a params.catalog_values (dominio ENROLLMENT_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  /** FK a params.catalog_values (dominio VERIFICATION_SOURCE). */
  @Column({ name: 'verification_source_id', type: 'uuid', nullable: true })
  verificationSourceId?: string;

  @Column({ name: 'last_verified_at', type: 'timestamptz', nullable: true })
  lastVerifiedAt?: Date;

  @Column({ name: 'next_verification_at', type: 'timestamptz', nullable: true })
  nextVerificationAt?: Date;

  @Column({ name: 'verification_failure_count', type: 'smallint', default: 0 })
  verificationFailureCount: number;

  @Column({ name: 'applies_without_trip', type: 'boolean', default: false })
  appliesWithoutTrip: boolean;

  @Column({
    name: 'coverage_activation_mode',
    type: 'varchar',
    length: 20,
    default: 'TRIP_REQUIRED',
  })
  coverageActivationMode: CoverageActivationMode;

  /** FK a params.catalog_values (dominio SYNC_STATUS). */
  @Column({ name: 'sync_status_id', type: 'uuid', nullable: true })
  syncStatusId?: string;

  @Column({ name: 'last_sync_attempt', type: 'timestamptz', nullable: true })
  lastSyncAttempt?: Date;

  @Column({ name: 'last_sync_success', type: 'timestamptz', nullable: true })
  lastSyncSuccess?: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
