import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';
import { LifecycleStatus } from './catalog-value.entity';

@Entity({ schema: 'params', name: 'policy_rules' })
export class PolicyRuleEntity extends UuidBaseEntity {
  /** NULL = regla global. FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ name: 'name_es', type: 'varchar', length: 200 })
  nameEs: string;

  @Column({ name: 'rule_type', type: 'varchar', length: 50 })
  ruleType: string;

  @Column({
    name: 'entity_scope',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  entityScope?: string;

  @Column({ type: 'smallint', default: 0 })
  priority: number;

  @Column({
    name: 'lifecycle_status',
    type: 'varchar',
    length: 20,
    default: 'ACTIVE',
  })
  lifecycleStatus: LifecycleStatus;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
