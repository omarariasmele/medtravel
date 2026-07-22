import { Column, Entity, Index } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';
import { LifecycleStatus } from './catalog-value.entity';

@Entity({ schema: 'params', name: 'workflow_definitions' })
@Index(['tenantId', 'code'], { unique: true })
export class WorkflowDefinitionEntity extends UuidBaseEntity {
  /** NULL = definición global. FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ name: 'name_es', type: 'varchar', length: 200 })
  nameEs: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType: string;

  @Column({ name: 'initial_state', type: 'varchar', length: 100 })
  initialState: string;

  @Column({ name: 'terminal_states', type: 'text', array: true })
  terminalStates: string[];

  @Column({
    name: 'lifecycle_status',
    type: 'varchar',
    length: 20,
    default: 'ACTIVE',
  })
  lifecycleStatus: LifecycleStatus;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
