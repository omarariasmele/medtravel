import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/** RLS/inmutabilidad: mismo patrón que AllergyEntity (clinical_access, C4, C10). */
@Entity({ schema: 'clinical', name: 'conditions' })
export class ConditionEntity extends UuidBaseEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  @Column({ name: 'icd10_code', type: 'varchar', length: 10, nullable: true })
  icd10Code?: string;

  @Column({ name: 'condition_name', type: 'text' })
  conditionName: string;

  @Column({ name: 'condition_name_en', type: 'text', nullable: true })
  conditionNameEn?: string;

  /** FK a params.catalog_values (dominio CONDITION_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  /** FK a params.catalog_values (dominio TRAVEL_RISK). */
  @Column({ name: 'travel_risk_id', type: 'uuid', nullable: true })
  travelRiskId?: string;

  @Column({ name: 'diagnosed_at', type: 'date', nullable: true })
  diagnosedAt?: string;

  @Column({ name: 'resolved_at', type: 'date', nullable: true })
  resolvedAt?: string;

  @Column({ name: 'treating_doctor', type: 'text', nullable: true })
  treatingDoctor?: string;

  @Column({
    name: 'treating_specialty',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  treatingSpecialty?: string;

  @Column({ name: 'treatment_notes', type: 'text', nullable: true })
  treatmentNotes?: string;

  @Column({ name: 'travel_restrictions', type: 'text', nullable: true })
  travelRestrictions?: string;

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

  @Column({ name: 'show_on_emergency', type: 'boolean', default: true })
  showOnEmergency: boolean;

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
