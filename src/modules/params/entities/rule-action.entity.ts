import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { PolicyRuleEntity } from './policy-rule.entity';

@Entity({ schema: 'params', name: 'rule_actions' })
export class RuleActionEntity extends UuidBaseEntity {
  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId: string;

  @ManyToOne(() => PolicyRuleEntity)
  @JoinColumn({ name: 'rule_id' })
  rule?: PolicyRuleEntity;

  @Column({ name: 'action_type', type: 'varchar', length: 50 })
  actionType: string;

  @Column({ name: 'action_payload', type: 'jsonb' })
  actionPayload: Record<string, unknown>;

  @Column({ name: 'execution_order', type: 'smallint', default: 0 })
  executionOrder: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
