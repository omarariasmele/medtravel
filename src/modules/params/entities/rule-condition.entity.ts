import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { PolicyRuleEntity } from './policy-rule.entity';

@Entity({ schema: 'params', name: 'rule_conditions' })
export class RuleConditionEntity extends UuidBaseEntity {
  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId: string;

  @ManyToOne(() => PolicyRuleEntity)
  @JoinColumn({ name: 'rule_id' })
  rule?: PolicyRuleEntity;

  @Column({ name: 'field_path', type: 'varchar', length: 200 })
  fieldPath: string;

  @Column({ type: 'varchar', length: 30 })
  operator: string;

  @Column({ name: 'value_type', type: 'varchar', length: 20 })
  valueType: string;

  @Column({ type: 'jsonb' })
  value: unknown;

  @Column({ name: 'logical_group', type: 'smallint', default: 0 })
  logicalGroup: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
