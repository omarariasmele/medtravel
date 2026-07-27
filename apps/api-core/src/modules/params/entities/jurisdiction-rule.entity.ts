import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

@Entity({ schema: 'params', name: 'jurisdiction_rules' })
export class JurisdictionRuleEntity extends UuidBaseEntity {
  @Column({ type: 'varchar', length: 10 })
  jurisdiction: string;

  @Column({ type: 'varchar', length: 20 })
  regulation: string;

  @Column({ name: 'rule_type', type: 'varchar', length: 50 })
  ruleType: string;

  @Column({ name: 'rule_config', type: 'jsonb' })
  ruleConfig: unknown;

  @Column({ name: 'effective_from', type: 'date' })
  effectiveFrom: string;

  @Column({ name: 'effective_until', type: 'date', nullable: true })
  effectiveUntil?: string;

  @Column({ name: 'description_es', type: 'text', nullable: true })
  descriptionEs?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
