import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/** RLS/inmutabilidad: mismo patrón que AllergyEntity. Sin columna `active`. */
@Entity({ schema: 'clinical', name: 'surgeries' })
export class SurgeryEntity extends UuidBaseEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  @Column({ name: 'procedure_name', type: 'text' })
  procedureName: string;

  @Column({ name: 'procedure_name_en', type: 'text', nullable: true })
  procedureNameEn?: string;

  @Column({ name: 'icd10_code', type: 'varchar', length: 10, nullable: true })
  icd10Code?: string;

  @Column({ name: 'snomed_code', type: 'varchar', length: 20, nullable: true })
  snomedCode?: string;

  @Column({ type: 'text', nullable: true })
  indication?: string;

  @Column({ name: 'body_region', type: 'varchar', length: 100, nullable: true })
  bodyRegion?: string;

  /** FK a params.catalog_values (dominio SURGICAL_APPROACH). */
  @Column({ name: 'approach_id', type: 'uuid', nullable: true })
  approachId?: string;

  @Column({ name: 'performed_at', type: 'date' })
  performedAt: string;

  @Column({ name: 'hospital_name', type: 'text', nullable: true })
  hospitalName?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'hospital_country_id', type: 'uuid', nullable: true })
  hospitalCountryId?: string;

  @Column({ name: 'surgeon_name', type: 'text', nullable: true })
  surgeonName?: string;

  @Column({
    name: 'surgeon_specialty',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  surgeonSpecialty?: string;

  /** FK a params.catalog_values (dominio SURGERY_OUTCOME). */
  @Column({ name: 'outcome_id', type: 'uuid', nullable: true })
  outcomeId?: string;

  @Column({ type: 'text', nullable: true })
  complications?: string;

  @Column({ name: 'recovery_notes', type: 'text', nullable: true })
  recoveryNotes?: string;

  @Column({ name: 'has_implant', type: 'boolean', default: false })
  hasImplant: boolean;

  @Column({ name: 'implant_details', type: 'text', nullable: true })
  implantDetails?: string;

  @Column({ name: 'implant_affects_imaging', type: 'boolean', default: false })
  implantAffectsImaging: boolean;

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

  @Column({
    name: 'requires_member_confirmation',
    type: 'boolean',
    default: true,
  })
  requiresMemberConfirmation: boolean;

  @Column({ name: 'show_on_emergency', type: 'boolean', default: true })
  showOnEmergency: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'deletion_reason_id', type: 'uuid', nullable: true })
  deletionReasonId?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
