import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { TravelAssistanceEnrollmentEntity } from './travel-assistance-enrollment.entity';
import { CoverageSponsorEntity } from './coverage-sponsor.entity';
import { CardNetworkEntity } from './card-network.entity';
import { CardIssuerEntity } from './card-issuer.entity';
import { CardBenefitProgramEntity } from './card-benefit-program.entity';

/** Sin PAN, CVV, PIN ni datos financieros completos — solo card_last_four. */
@Entity({ schema: 'coverage', name: 'coverage_acquisition_channels' })
export class CoverageAcquisitionChannelEntity extends UuidBaseEntity {
  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @ManyToOne(() => TravelAssistanceEnrollmentEntity)
  @JoinColumn({ name: 'enrollment_id' })
  enrollment?: TravelAssistanceEnrollmentEntity;

  /** FK a params.catalog_values (dominio ACQUISITION_CHANNEL_TYPE). */
  @Column({ name: 'channel_type_id', type: 'uuid' })
  channelTypeId: string;

  @Column({ name: 'sponsor_id', type: 'uuid', nullable: true })
  sponsorId?: string;

  @ManyToOne(() => CoverageSponsorEntity)
  @JoinColumn({ name: 'sponsor_id' })
  sponsor?: CoverageSponsorEntity;

  @Column({ name: 'card_network_id', type: 'uuid', nullable: true })
  cardNetworkId?: string;

  @ManyToOne(() => CardNetworkEntity)
  @JoinColumn({ name: 'card_network_id' })
  cardNetwork?: CardNetworkEntity;

  @Column({ name: 'card_issuer_id', type: 'uuid', nullable: true })
  cardIssuerId?: string;

  @ManyToOne(() => CardIssuerEntity)
  @JoinColumn({ name: 'card_issuer_id' })
  cardIssuer?: CardIssuerEntity;

  @Column({ name: 'benefit_program_id', type: 'uuid', nullable: true })
  benefitProgramId?: string;

  @ManyToOne(() => CardBenefitProgramEntity)
  @JoinColumn({ name: 'benefit_program_id' })
  benefitProgram?: CardBenefitProgramEntity;

  @Column({ name: 'card_last_four', type: 'char', length: 4, nullable: true })
  cardLastFour?: string;

  @Column({ name: 'card_expiry_month', type: 'smallint', nullable: true })
  cardExpiryMonth?: number;

  @Column({ name: 'card_expiry_year', type: 'smallint', nullable: true })
  cardExpiryYear?: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
