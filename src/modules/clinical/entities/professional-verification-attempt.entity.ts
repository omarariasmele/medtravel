import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { HealthcareProfessionalEntity } from './healthcare-professional.entity';

@Entity({ schema: 'clinical', name: 'professional_verification_attempts' })
export class ProfessionalVerificationAttemptEntity extends UuidBaseEntity {
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => HealthcareProfessionalEntity)
  @JoinColumn({ name: 'professional_id' })
  professional?: HealthcareProfessionalEntity;

  /** FK a params.catalog_values (dominio PROFESSIONAL_TRUST_LEVEL). */
  @Column({ name: 'target_level_id', type: 'uuid' })
  targetLevelId: string;

  /** FK a params.catalog_values (dominio VERIFICATION_METHOD). */
  @Column({ name: 'method_id', type: 'uuid' })
  methodId: string;

  @Column({ name: 'evidence_type', type: 'varchar', length: 50 })
  evidenceType: string;

  @Column({ name: 'evidence_data', type: 'jsonb', default: {} })
  evidenceData: Record<string, unknown>;

  @Column({
    name: 'confidence_score',
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
  })
  confidenceScore?: string;

  /** FK a params.catalog_values (dominio VERIFICATION_ATTEMPT_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'reviewer_notes', type: 'text', nullable: true })
  reviewerNotes?: string;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy?: string;

  @Column({ name: 'attempted_at', type: 'timestamptz' })
  attemptedAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date;
}
