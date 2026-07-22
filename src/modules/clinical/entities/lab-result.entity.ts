import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * RLS/inmutabilidad: mismo patrón que AllergyEntity. Los campos de panel
 * (hemograma, glucemia, lípidos, etc.) son NUMERIC opcionales tal cual el
 * schema — se listan explícitamente en vez de un JSONB único porque así
 * están definidos en 005_clinical.sql (permiten indexar/filtrar por valor).
 */
@Entity({ schema: 'clinical', name: 'lab_results' })
export class LabResultEntity extends UuidBaseEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  @Column({ name: 'performed_at', type: 'date' })
  performedAt: string;

  @Column({ name: 'lab_name', type: 'text', nullable: true })
  labName?: string;

  @Column({ name: 'requested_by', type: 'text', nullable: true })
  requestedBy?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId?: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  hemoglobin?: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  hematocrit?: string;

  @Column({
    name: 'white_blood_cells',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  whiteBloodCells?: string;

  @Column({ type: 'numeric', precision: 7, scale: 0, nullable: true })
  platelets?: string;

  @Column({
    name: 'neutrophils_pct',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  neutrophilsPct?: string;

  @Column({
    name: 'lymphocytes_pct',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  lymphocytesPct?: string;

  @Column({
    name: 'glucose_fasting',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  glucoseFasting?: string;

  @Column({
    name: 'glucose_postprand',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  glucosePostprand?: string;

  @Column({ type: 'numeric', precision: 4, scale: 2, nullable: true })
  hba1c?: string;

  @Column({
    name: 'total_cholesterol',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  totalCholesterol?: string;

  @Column({
    name: 'hdl_cholesterol',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  hdlCholesterol?: string;

  @Column({
    name: 'ldl_cholesterol',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  ldlCholesterol?: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  triglycerides?: string;

  @Column({ type: 'numeric', precision: 5, scale: 3, nullable: true })
  creatinine?: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  bun?: string;

  @Column({
    name: 'uric_acid',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  uricAcid?: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  egfr?: string;

  @Column({ type: 'numeric', precision: 7, scale: 2, nullable: true })
  alt?: string;

  @Column({ type: 'numeric', precision: 7, scale: 2, nullable: true })
  ast?: string;

  @Column({ type: 'numeric', precision: 7, scale: 2, nullable: true })
  ggt?: string;

  @Column({
    name: 'total_bilirubin',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  totalBilirubin?: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  albumin?: string;

  @Column({ type: 'numeric', precision: 7, scale: 4, nullable: true })
  tsh?: string;

  @Column({
    name: 't3_free',
    type: 'numeric',
    precision: 6,
    scale: 3,
    nullable: true,
  })
  t3Free?: string;

  @Column({
    name: 't4_free',
    type: 'numeric',
    precision: 6,
    scale: 3,
    nullable: true,
  })
  t4Free?: string;

  @Column({
    name: 'pt_inr',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  ptInr?: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  aptt?: string;

  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  sodium?: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  potassium?: string;

  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  calcium?: string;

  @Column({ type: 'numeric', precision: 7, scale: 3, nullable: true })
  crp?: string;

  @Column({ type: 'numeric', precision: 8, scale: 2, nullable: true })
  ferritin?: string;

  @Column({
    name: 'vitamin_d',
    type: 'numeric',
    precision: 7,
    scale: 2,
    nullable: true,
  })
  vitaminD?: string;

  @Column({
    name: 'vitamin_b12',
    type: 'numeric',
    precision: 7,
    scale: 2,
    nullable: true,
  })
  vitaminB12?: string;

  @Column({ name: 'custom_values', type: 'jsonb', default: [] })
  customValues: unknown[];

  @Column({ name: 'ai_processed', type: 'boolean', default: false })
  aiProcessed: boolean;

  @Column({ name: 'ai_processed_at', type: 'timestamptz', nullable: true })
  aiProcessedAt?: Date;

  @Column({ name: 'ai_alerts', type: 'jsonb', default: [] })
  aiAlerts: unknown[];

  @Column({ name: 'ai_summary_es', type: 'text', nullable: true })
  aiSummaryEs?: string;

  @Column({ name: 'ai_summary_en', type: 'text', nullable: true })
  aiSummaryEn?: string;

  /** FK a params.catalog_values (dominio AI_RISK_LEVEL). */
  @Column({ name: 'ai_risk_level_id', type: 'uuid', nullable: true })
  aiRiskLevelId?: string;

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

  @Column({ name: 'source_document_id', type: 'uuid', nullable: true })
  sourceDocumentId?: string;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'deletion_reason_id', type: 'uuid', nullable: true })
  deletionReasonId?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
