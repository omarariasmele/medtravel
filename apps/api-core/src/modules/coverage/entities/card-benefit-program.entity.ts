import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { CardIssuerEntity } from './card-issuer.entity';
import { AssistancePlanEntity } from './assistance-plan.entity';

@Entity({ schema: 'coverage', name: 'card_benefit_programs' })
export class CardBenefitProgramEntity extends UuidBaseEntity {
  @Column({ name: 'issuer_id', type: 'uuid' })
  issuerId: string;

  @ManyToOne(() => CardIssuerEntity)
  @JoinColumn({ name: 'issuer_id' })
  issuer?: CardIssuerEntity;

  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @ManyToOne(() => AssistancePlanEntity)
  @JoinColumn({ name: 'plan_id' })
  plan?: AssistancePlanEntity;

  @Column({ name: 'program_name', type: 'varchar', length: 200 })
  programName: string;

  /** FK a params.catalog_values (dominio CARD_TIER). */
  @Column({ name: 'card_tier_id', type: 'uuid', nullable: true })
  cardTierId?: string;

  @Column({ name: 'eligibility_rules', type: 'jsonb', default: {} })
  eligibilityRules: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
