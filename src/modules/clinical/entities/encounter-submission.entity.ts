import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { EncounterEntity } from './encounter.entity';
import { HealthcareProfessionalEntity } from './healthcare-professional.entity';
import { ClinicalDocumentEntity } from './clinical-document.entity';

/**
 * MTA-511 (cambio #1, #7, #9, #10): los aportes profesionales quedan
 * separados del historial canónico hasta que las 3 dimensiones de estado lo
 * habilitan — ver clinical.allergies para la explicación del modelo.
 * PROFESSIONAL_CERTIFIED va directo al canónico sin pasar por confirmación
 * del titular (requires_member_confirmation=false en ese caso). El titular
 * puede impugnar (member_challenged) sin que se borre el dato original ni
 * la trazabilidad del profesional (person_id/member_id inmutables, C10).
 * RLS: submissions_access + submission_insert/update con
 * has_clinical_access(person_id) O ser el profesional autor;
 * submission_no_delete (USING FALSE).
 */
@Entity({ schema: 'clinical', name: 'encounter_submissions' })
export class EncounterSubmissionEntity extends UuidBaseEntity {
  @Column({ name: 'encounter_id', type: 'uuid' })
  encounterId: string;

  @ManyToOne(() => EncounterEntity)
  @JoinColumn({ name: 'encounter_id' })
  encounter?: EncounterEntity;

  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => HealthcareProfessionalEntity)
  @JoinColumn({ name: 'professional_id' })
  professional?: HealthcareProfessionalEntity;

  /** FK a params.catalog_values (dominio SUBMISSION_TYPE — ej. ALLERGY, CONDITION, etc). */
  @Column({ name: 'submission_type_id', type: 'uuid' })
  submissionTypeId: string;

  @Column({ name: 'clinical_data', type: 'jsonb' })
  clinicalData: Record<string, unknown>;

  @Column({ name: 'icd10_code', type: 'varchar', length: 10, nullable: true })
  icd10Code?: string;

  @Column({ name: 'rxnorm_code', type: 'varchar', length: 20, nullable: true })
  rxnormCode?: string;

  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId?: string;

  @ManyToOne(() => ClinicalDocumentEntity)
  @JoinColumn({ name: 'document_id' })
  document?: ClinicalDocumentEntity;

  @Column({ name: 'canonical_status_id', type: 'uuid' })
  canonicalStatusId: string;

  @Column({ name: 'confirmation_status_id', type: 'uuid', nullable: true })
  confirmationStatusId?: string;

  @Column({ name: 'certification_status_id', type: 'uuid', nullable: true })
  certificationStatusId?: string;

  @Column({
    name: 'requires_member_confirmation',
    type: 'boolean',
    default: true,
  })
  requiresMemberConfirmation: boolean;

  @Column({ name: 'member_reviewed_at', type: 'timestamptz', nullable: true })
  memberReviewedAt?: Date;

  @Column({ name: 'member_confirmed', type: 'boolean', nullable: true })
  memberConfirmed?: boolean;

  @Column({ name: 'member_challenged', type: 'boolean', default: false })
  memberChallenged: boolean;

  @Column({ name: 'member_challenge_notes', type: 'text', nullable: true })
  memberChallengeNotes?: string;

  /** Snapshot del profesional al momento del submission (auditoría histórica). */
  @Column({
    name: 'professional_license_snapshot',
    type: 'text',
    nullable: true,
  })
  professionalLicenseSnapshot?: string;

  @Column({
    name: 'professional_trust_level_snapshot',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  professionalTrustLevelSnapshot?: string;

  @Column({
    name: 'professional_country_snapshot',
    type: 'varchar',
    length: 3,
    nullable: true,
  })
  professionalCountrySnapshot?: string;

  @Column({ name: 'submission_ip', type: 'inet', nullable: true })
  submissionIp?: string;

  @Column({ name: 'submission_device', type: 'text', nullable: true })
  submissionDevice?: string;

  /** Apunta a la fila canónica una vez promovido (ej. clinical.allergies.id). */
  @Column({ name: 'canonical_record_id', type: 'uuid', nullable: true })
  canonicalRecordId?: string;

  @Column({
    name: 'canonical_record_table',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  canonicalRecordTable?: string;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'deletion_reason_id', type: 'uuid', nullable: true })
  deletionReasonId?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
