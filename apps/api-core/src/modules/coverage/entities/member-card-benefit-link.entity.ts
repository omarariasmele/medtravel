import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { CardBenefitProgramEntity } from './card-benefit-program.entity';
import { TravelAssistanceEnrollmentEntity } from './travel-assistance-enrollment.entity';

@Entity({ schema: 'coverage', name: 'member_card_benefit_links' })
export class MemberCardBenefitLinkEntity extends UuidBaseEntity {
  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @Column({ name: 'benefit_program_id', type: 'uuid' })
  benefitProgramId: string;

  @ManyToOne(() => CardBenefitProgramEntity)
  @JoinColumn({ name: 'benefit_program_id' })
  benefitProgram?: CardBenefitProgramEntity;

  @Column({ name: 'enrollment_id', type: 'uuid', nullable: true })
  enrollmentId?: string;

  @ManyToOne(() => TravelAssistanceEnrollmentEntity)
  @JoinColumn({ name: 'enrollment_id' })
  enrollment?: TravelAssistanceEnrollmentEntity;

  /** FK a params.catalog_values (dominio VERIFICATION_STATUS). */
  @Column({ name: 'verification_status_id', type: 'uuid' })
  verificationStatusId: string;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt?: Date;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
