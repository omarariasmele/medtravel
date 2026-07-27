import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * RLS: clinical_access (USING clinical.has_clinical_access(person_id)),
 * más allergy_insert/allergy_update con el mismo predicado y
 * allergy_no_delete (USING FALSE) — nunca hacer un DELETE real, usar
 * deleted_at/deletion_reason_id (C4, retención regulada). person_id y
 * member_id son inmutables tras el INSERT (trg_allergies_immutable, C10).
 *
 * MTA-511: canonical_status_id / confirmation_status_id /
 * certification_status_id son 3 dimensiones independientes — ver
 * MedTravelApp_MTA511_ModeloLogico.docx sección 2.
 */
@Entity({ schema: 'clinical', name: 'allergies' })
export class AllergyEntity extends UuidBaseEntity {
  /** FK a core.persons — entidad raíz del historial clínico. */
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  @Column({ name: 'allergen_name', type: 'text' })
  allergenName: string;

  /** FK a params.catalog_values (dominio ALLERGEN_TYPE). */
  @Column({ name: 'allergen_type_id', type: 'uuid' })
  allergenTypeId: string;

  @Column({
    name: 'allergen_snomed',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  allergenSnomed?: string;

  @Column({ name: 'rxnorm_code', type: 'varchar', length: 20, nullable: true })
  rxnormCode?: string;

  /** FK a params.catalog_values (dominio REACTION_TYPE). */
  @Column({ name: 'reaction_type_id', type: 'uuid', nullable: true })
  reactionTypeId?: string;

  /** FK a params.catalog_values (dominio ALLERGY_SEVERITY). */
  @Column({ name: 'severity_id', type: 'uuid' })
  severityId: string;

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

  /** FK a params.catalog_values (dominio PROVENANCE). */
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
