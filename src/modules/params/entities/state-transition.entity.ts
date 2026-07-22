import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { WorkflowDefinitionEntity } from './workflow-definition.entity';

@Entity({ schema: 'params', name: 'state_transitions' })
export class StateTransitionEntity extends UuidBaseEntity {
  @Column({ name: 'workflow_id', type: 'uuid' })
  workflowId: string;

  @ManyToOne(() => WorkflowDefinitionEntity)
  @JoinColumn({ name: 'workflow_id' })
  workflow?: WorkflowDefinitionEntity;

  @Column({ name: 'from_state', type: 'varchar', length: 100 })
  fromState: string;

  @Column({ name: 'to_state', type: 'varchar', length: 100 })
  toState: string;

  @Column({ name: 'trigger_event', type: 'varchar', length: 100 })
  triggerEvent: string;

  @Column({ name: 'allowed_roles', type: 'text', array: true, nullable: true })
  allowedRoles?: string[];

  @Column({ type: 'jsonb', default: {} })
  conditions: Record<string, unknown>;

  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
