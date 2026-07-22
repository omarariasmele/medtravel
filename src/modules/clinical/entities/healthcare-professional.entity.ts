import { Column, Entity, Index } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * B7: el profesional ES un core.users — no hay un segundo subsistema de
 * autenticación (sin password_hash propio, ver core.authentication_credentials
 * vía user_id). trust_level_id referencia el dominio de catálogo
 * PROFESSIONAL_TRUST_LEVEL (MTA-511, 5 niveles: REGISTERED,
 * IDENTITY_VERIFIED, LICENSE_DECLARED, PROFESSIONAL_CERTIFIED,
 * INSTITUTION_VERIFIED). mfa_required se activa solo automáticamente por
 * trigger (trg_professional_mfa) cuando trust_level alcanza
 * PROFESSIONAL_CERTIFIED/INSTITUTION_VERIFIED — no setearlo manualmente.
 */
@Entity({ schema: 'clinical', name: 'healthcare_professionals' })
@Index(['docTypeId', 'docNumberIdx'], { unique: true })
export class HealthcareProfessionalEntity extends UuidBaseEntity {
  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @Column({ name: 'first_name', type: 'text' })
  firstName: string;

  @Column({ name: 'last_name', type: 'text' })
  lastName: string;

  /** FK a params.catalog_values (dominio DOC_TYPE). */
  @Column({ name: 'doc_type_id', type: 'uuid' })
  docTypeId: string;

  @Column({ name: 'doc_number', type: 'bytea' })
  docNumber: Buffer;

  @Column({ name: 'doc_number_idx', type: 'text' })
  docNumberIdx: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid' })
  countryId: string;

  @Column({
    name: 'license_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  licenseNumber?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'license_country_id', type: 'uuid', nullable: true })
  licenseCountryId?: string;

  /** FK a params.catalog_values (dominio MEDICAL_SPECIALTY). */
  @Column({ name: 'specialty_id', type: 'uuid', nullable: true })
  specialtyId?: string;

  @Column({ type: 'text', nullable: true })
  institution?: string;

  /** FK a params.catalog_values (dominio PROFESSIONAL_TRUST_LEVEL). */
  @Column({ name: 'trust_level_id', type: 'uuid' })
  trustLevelId: string;

  @Column({ name: 'mfa_required', type: 'boolean', default: false })
  mfaRequired: boolean;

  @Column({ name: 'terms_accepted', type: 'boolean', default: false })
  termsAccepted: boolean;

  @Column({ name: 'terms_accepted_at', type: 'timestamptz', nullable: true })
  termsAcceptedAt?: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'deletion_reason_id', type: 'uuid', nullable: true })
  deletionReasonId?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
