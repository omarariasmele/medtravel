import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * Pedido explícito del usuario: "para el caso de diálisis, como la
 * tenemos que tratar ya que es un tratamiento" — un TRATAMIENTO
 * (diálisis, quimioterapia, radioterapia, etc.) es un concepto médico
 * distinto de una enfermedad/CONDITION. Mismo patrón RLS/inmutabilidad
 * que ConditionEntity (status_id reutiliza el dominio CONDITION_STATUS,
 * source_question_id para el mismo anti-duplicado por pregunta).
 */
@Entity({ schema: 'clinical', name: 'treatments' })
export class TreatmentEntity extends UuidBaseEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  @Column({ name: 'treatment_name', type: 'text' })
  treatmentName: string;

  /** FK a params.catalog_values (dominio TREATMENT_TYPE). */
  @Column({ name: 'treatment_catalog_id', type: 'uuid', nullable: true })
  treatmentCatalogId?: string;

  /** FK a params.catalog_values (dominio CONDITION_STATUS, reutilizado). */
  @Column({ name: 'status_id', type: 'uuid', nullable: true })
  statusId?: string;

  @Column({ name: 'started_at', type: 'date', nullable: true })
  startedAt?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

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

  /** Ver AIConditionProposalData.sourceQuestionId — evita volver a preguntar en una consulta de seguimiento. */
  @Column({ name: 'source_question_id', type: 'uuid', nullable: true })
  sourceQuestionId?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'deletion_reason_id', type: 'uuid', nullable: true })
  deletionReasonId?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
