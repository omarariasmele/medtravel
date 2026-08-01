import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { AssistancePlanEntity } from './assistance-plan.entity';

@Entity({ schema: 'coverage', name: 'coverage_eligibility_rules' })
export class CoverageEligibilityRuleEntity extends UuidBaseEntity {
  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @ManyToOne(() => AssistancePlanEntity)
  @JoinColumn({ name: 'plan_id' })
  plan?: AssistancePlanEntity;

  /** FK a params.catalog_values (dominio ELIGIBILITY_RULE_TYPE). */
  @Column({ name: 'rule_type_id', type: 'uuid' })
  ruleTypeId: string;

  @Column({ name: 'rule_config', type: 'jsonb' })
  ruleConfig: unknown;

  @Column({ name: 'error_message_es', type: 'text', nullable: true })
  errorMessageEs?: string;

  @Column({ name: 'error_message_en', type: 'text', nullable: true })
  errorMessageEn?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
