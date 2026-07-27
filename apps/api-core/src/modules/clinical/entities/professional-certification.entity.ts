import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { HealthcareProfessionalEntity } from './healthcare-professional.entity';

@Entity({ schema: 'clinical', name: 'professional_certifications' })
export class ProfessionalCertificationEntity extends UuidBaseEntity {
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => HealthcareProfessionalEntity)
  @JoinColumn({ name: 'professional_id' })
  professional?: HealthcareProfessionalEntity;

  /** FK a params.catalog_values (dominio PROFESSIONAL_TRUST_LEVEL). */
  @Column({ name: 'level_id', type: 'uuid' })
  levelId: string;

  @Column({ name: 'granted_by', type: 'uuid', nullable: true })
  grantedBy?: string;

  @Column({ type: 'varchar', length: 50 })
  source: string;

  @Column({ name: 'verification_data', type: 'jsonb', default: {} })
  verificationData: Record<string, unknown>;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom: Date;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil?: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  @Column({ name: 'revoke_reason', type: 'text', nullable: true })
  revokeReason?: string;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
