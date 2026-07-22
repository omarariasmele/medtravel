import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { StateTransitionEntity } from './state-transition.entity';

@Entity({ schema: 'params', name: 'workflow_actions' })
export class WorkflowActionEntity extends UuidBaseEntity {
  @Column({ name: 'transition_id', type: 'uuid' })
  transitionId: string;

  @ManyToOne(() => StateTransitionEntity)
  @JoinColumn({ name: 'transition_id' })
  transition?: StateTransitionEntity;

  @Column({ name: 'action_type', type: 'varchar', length: 50 })
  actionType: string;

  @Column({ name: 'action_config', type: 'jsonb' })
  actionConfig: Record<string, unknown>;

  @Column({ name: 'execution_order', type: 'smallint', default: 0 })
  executionOrder: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
