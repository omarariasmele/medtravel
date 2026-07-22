import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/** RLS/inmutabilidad: mismo patrón que AllergyEntity. Sin columna `active`. */
@Entity({ schema: 'clinical', name: 'vaccines' })
export class VaccineEntity extends UuidBaseEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  @Column({ name: 'vaccine_name', type: 'text' })
  vaccineName: string;

  @Column({ name: 'vaccine_name_en', type: 'text', nullable: true })
  vaccineNameEn?: string;

  @Column({ name: 'cvx_code', type: 'varchar', length: 10, nullable: true })
  cvxCode?: string;

  @Column({ type: 'text', nullable: true })
  manufacturer?: string;

  @Column({ name: 'batch_number', type: 'text', nullable: true })
  batchNumber?: string;

  @Column({ name: 'administered_at', type: 'date' })
  administeredAt: string;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil?: string;

  @Column({ name: 'administered_by', type: 'text', nullable: true })
  administeredBy?: string;

  @Column({ type: 'text', nullable: true })
  institution?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId?: string;

  @Column({ name: 'certificate_number', type: 'text', nullable: true })
  certificateNumber?: string;

  @Column({ name: 'has_certificate', type: 'boolean', default: false })
  hasCertificate: boolean;

  @Column({
    name: 'required_for_travel',
    type: 'text',
    array: true,
    nullable: true,
  })
  requiredForTravel?: string[];

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

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'deletion_reason_id', type: 'uuid', nullable: true })
  deletionReasonId?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
