import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { ConditionEntity } from './condition.entity';

/** RLS/inmutabilidad: mismo patrón que AllergyEntity. */
@Entity({ schema: 'clinical', name: 'medications' })
export class MedicationEntity extends UuidBaseEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  @Column({ name: 'rxnorm_code', type: 'varchar', length: 20, nullable: true })
  rxnormCode?: string;

  @Column({ name: 'generic_name', type: 'text' })
  genericName: string;

  @Column({ name: 'brand_name', type: 'text', nullable: true })
  brandName?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'brand_country_id', type: 'uuid', nullable: true })
  brandCountryId?: string;

  @Column({
    name: 'dose_amount',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  doseAmount?: string;

  /** FK a params.catalog_values (dominio DOSE_UNIT). */
  @Column({ name: 'dose_unit_id', type: 'uuid', nullable: true })
  doseUnitId?: string;

  /** FK a params.catalog_values (dominio DOSE_FORM). */
  @Column({ name: 'dose_form_id', type: 'uuid', nullable: true })
  doseFormId?: string;

  /** FK a params.catalog_values (dominio MEDICATION_FREQUENCY). */
  @Column({ name: 'frequency_id', type: 'uuid', nullable: true })
  frequencyId?: string;

  /** FK a params.catalog_values (dominio MEDICATION_ROUTE). */
  @Column({ name: 'route_id', type: 'uuid', nullable: true })
  routeId?: string;

  @Column({ name: 'with_food', type: 'boolean', nullable: true })
  withFood?: boolean;

  @Column({ name: 'time_of_day', type: 'text', array: true, nullable: true })
  timeOfDay?: string[];

  @Column({ name: 'prescribed_by', type: 'text', nullable: true })
  prescribedBy?: string;

  @Column({ name: 'prescribed_date', type: 'date', nullable: true })
  prescribedDate?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'prescribed_country_id', type: 'uuid', nullable: true })
  prescribedCountryId?: string;

  @Column({ name: 'condition_id', type: 'uuid', nullable: true })
  conditionId?: string;

  @ManyToOne(() => ConditionEntity)
  @JoinColumn({ name: 'condition_id' })
  condition?: ConditionEntity;

  @Column({ name: 'started_at', type: 'date', nullable: true })
  startedAt?: string;

  @Column({ name: 'ended_at', type: 'date', nullable: true })
  endedAt?: string;

  @Column({ name: 'is_current', type: 'boolean', default: true })
  isCurrent: boolean;

  @Column({ name: 'is_chronic', type: 'boolean', default: false })
  isChronic: boolean;

  @Column({ name: 'requires_cold_chain', type: 'boolean', default: false })
  requiresColdChain: boolean;

  @Column({ name: 'requires_certificate', type: 'boolean', default: false })
  requiresCertificate: boolean;

  @Column({ name: 'travel_notes', type: 'text', nullable: true })
  travelNotes?: string;

  @Column({ name: 'canonical_status_id', type: 'uuid' })
  canonicalStatusId: string;

  @Column({ name: 'confirmation_status_id', type: 'uuid', nullable: true })
  confirmationStatusId?: string;

  @Column({ name: 'certification_status_id', type: 'uuid', nullable: true })
  certificationStatusId?: string;

  @Column({ name: 'member_confirmed', type: 'boolean', default: false })
  memberConfirmed: boolean;

  @Column({ name: 'member_confirmed_at', type: 'timestamptz', nullable: true })
  memberConfirmedAt?: Date;

  @Column({ name: 'member_challenged', type: 'boolean', default: false })
  memberChallenged: boolean;

  @Column({ name: 'member_challenge_notes', type: 'text', nullable: true })
  memberChallengeNotes?: string;

  @Column({ name: 'provenance_id', type: 'uuid' })
  provenanceId: string;

  @Column({ name: 'ai_assisted', type: 'boolean', default: false })
  aiAssisted: boolean;

  @Column({ name: 'ai_completed_fields', type: 'jsonb', default: {} })
  aiCompletedFields: Record<string, unknown>;

  @Column({
    name: 'requires_member_confirmation',
    type: 'boolean',
    default: true,
  })
  requiresMemberConfirmation: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'deletion_reason_id', type: 'uuid', nullable: true })
  deletionReasonId?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
