import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { TravelAssistanceEnrollmentEntity } from './travel-assistance-enrollment.entity';

export type EligibilityFailureType =
  'EXPIRED' | 'SYNC_FAILURE' | 'PLAN_CHANGED' | 'NOT_FOUND';

/** B11: distingue vencida (EXPIRED) de no verificada (SYNC_FAILURE, etc). */
@Entity({ schema: 'coverage', name: 'coverage_eligibility_verifications' })
export class CoverageEligibilityVerificationEntity extends UuidBaseEntity {
  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @ManyToOne(() => TravelAssistanceEnrollmentEntity)
  @JoinColumn({ name: 'enrollment_id' })
  enrollment?: TravelAssistanceEnrollmentEntity;

  /** FK a params.catalog_values (dominio VERIFICATION_TYPE). */
  @Column({ name: 'verification_type_id', type: 'uuid' })
  verificationTypeId: string;

  /** FK a params.catalog_values (dominio VERIFICATION_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'response_data', type: 'jsonb', default: {} })
  responseData: Record<string, unknown>;

  @Column({
    name: 'failure_reasons',
    type: 'text',
    array: true,
    nullable: true,
  })
  failureReasons?: string[];

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt?: Date;

  @Column({ name: 'verified_by_id', type: 'uuid', nullable: true })
  verifiedById?: string;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil?: Date;

  @Column({
    name: 'failure_type',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  failureType?: EligibilityFailureType;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
