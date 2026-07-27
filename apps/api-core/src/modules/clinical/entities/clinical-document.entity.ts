import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { ConditionEntity } from './condition.entity';
import { SurgeryEntity } from './surgery.entity';
import { LabResultEntity } from './lab-result.entity';
import { VaccineEntity } from './vaccine.entity';

/**
 * RLS/inmutabilidad: mismo patrón que AllergyEntity. is_encrypted +
 * encryption_key_ref: el archivo en storage_path va cifrado — esta fila solo
 * referencia la clave, nunca contiene el contenido del documento.
 */
@Entity({ schema: 'clinical', name: 'documents' })
export class ClinicalDocumentEntity extends UuidBaseEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  /** FK a params.catalog_values (dominio DOCUMENT_TYPE). */
  @Column({ name: 'document_type_id', type: 'uuid' })
  documentTypeId: string;

  @Column({ name: 'file_name_original', type: 'text' })
  fileNameOriginal: string;

  @Column({ name: 'file_name_storage', type: 'text' })
  fileNameStorage: string;

  @Column({ name: 'file_extension', type: 'varchar', length: 10 })
  fileExtension: string;

  @Column({ name: 'file_size_bytes', type: 'int' })
  fileSizeBytes: number;

  @Column({ name: 'file_hash_sha256', type: 'text' })
  fileHashSha256: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'storage_path', type: 'text' })
  storagePath: string;

  @Column({ name: 'is_encrypted', type: 'boolean', default: true })
  isEncrypted: boolean;

  @Column({ name: 'encryption_key_ref', type: 'text', nullable: true })
  encryptionKeyRef?: string;

  @Column({ type: 'text', nullable: true })
  title?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'document_date', type: 'date', nullable: true })
  documentDate?: string;

  @Column({ name: 'issuing_doctor', type: 'text', nullable: true })
  issuingDoctor?: string;

  @Column({ name: 'issuing_institution', type: 'text', nullable: true })
  issuingInstitution?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId?: string;

  @Column({
    name: 'language_original',
    type: 'char',
    length: 5,
    nullable: true,
  })
  languageOriginal?: string;

  @Column({ name: 'condition_id', type: 'uuid', nullable: true })
  conditionId?: string;

  @ManyToOne(() => ConditionEntity)
  @JoinColumn({ name: 'condition_id' })
  condition?: ConditionEntity;

  @Column({ name: 'surgery_id', type: 'uuid', nullable: true })
  surgeryId?: string;

  @ManyToOne(() => SurgeryEntity)
  @JoinColumn({ name: 'surgery_id' })
  surgery?: SurgeryEntity;

  @Column({ name: 'lab_result_id', type: 'uuid', nullable: true })
  labResultId?: string;

  @ManyToOne(() => LabResultEntity)
  @JoinColumn({ name: 'lab_result_id' })
  labResult?: LabResultEntity;

  @Column({ name: 'vaccine_id', type: 'uuid', nullable: true })
  vaccineId?: string;

  @ManyToOne(() => VaccineEntity)
  @JoinColumn({ name: 'vaccine_id' })
  vaccine?: VaccineEntity;

  @Column({ name: 'expires_at', type: 'date', nullable: true })
  expiresAt?: string;

  @Column({ name: 'expiry_notified', type: 'boolean', default: false })
  expiryNotified: boolean;

  @Column({ name: 'show_on_emergency', type: 'boolean', default: false })
  showOnEmergency: boolean;

  /** FK a params.catalog_values (dominio DOCUMENT_ACCESS_LEVEL). */
  @Column({ name: 'access_level_id', type: 'uuid' })
  accessLevelId: string;

  @Column({ name: 'ai_processed', type: 'boolean', default: false })
  aiProcessed: boolean;

  @Column({ name: 'ai_queued_at', type: 'timestamptz', nullable: true })
  aiQueuedAt?: Date;

  @Column({ name: 'ai_processed_at', type: 'timestamptz', nullable: true })
  aiProcessedAt?: Date;

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

  @Column({ name: 'provenance_id', type: 'uuid' })
  provenanceId: string;

  /** FK a params.catalog_values (dominio DOCUMENT_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'deletion_reason_id', type: 'uuid', nullable: true })
  deletionReasonId?: string;

  @Column({ name: 'archive_until', type: 'date', nullable: true })
  archiveUntil?: string;

  /** FK a core.users (quien subió el documento — puede ser el titular o un profesional). */
  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy: string;

  /** FK a params.catalog_values (dominio DOCUMENT_SOURCE). */
  @Column({ name: 'source_id', type: 'uuid', nullable: true })
  sourceId?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
