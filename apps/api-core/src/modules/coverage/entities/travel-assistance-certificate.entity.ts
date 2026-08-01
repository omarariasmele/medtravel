import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { TravelAssistanceEnrollmentEntity } from './travel-assistance-enrollment.entity';

/**
 * RLS (C3, 004_coverage.sql): cert_select/cert_insert; sin UPDATE ni DELETE
 * (cert_no_update/cert_no_delete siempre USING (FALSE)) — un certificado
 * reemplazado se referencia vía replaced_by_id, nunca se edita in-place.
 */
@Entity({ schema: 'coverage', name: 'travel_assistance_certificates' })
export class TravelAssistanceCertificateEntity extends UuidBaseEntity {
  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @ManyToOne(() => TravelAssistanceEnrollmentEntity)
  @JoinColumn({ name: 'enrollment_id' })
  enrollment?: TravelAssistanceEnrollmentEntity;

  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @Column({
    name: 'certificate_number',
    type: 'varchar',
    length: 100,
    unique: true,
  })
  certificateNumber: string;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt: Date;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_until', type: 'date' })
  validUntil: string;

  @Column({
    name: 'timezone_rule',
    type: 'varchar',
    length: 50,
    default: 'UTC',
  })
  timezoneRule: string;

  /** Sin importes (B8) — solo resumen cualitativo de coberturas incluidas. */
  @Column({ name: 'coverage_summary', type: 'jsonb' })
  coverageSummary: Record<string, unknown>;

  @Column({ name: 'document_url', type: 'text', nullable: true })
  documentUrl?: string;

  @Column({ name: 'document_hash', type: 'text', nullable: true })
  documentHash?: string;

  @Column({ name: 'language_code', type: 'char', length: 5, default: 'es' })
  languageCode: string;

  /** FK a params.catalog_values (dominio CERTIFICATE_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'replaced_by_id', type: 'uuid', nullable: true })
  replacedById?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
