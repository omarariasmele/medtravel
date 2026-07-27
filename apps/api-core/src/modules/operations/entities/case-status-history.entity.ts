import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { EmergencyCaseEntity } from './emergency-case.entity';

/** Inmutable — insertada automáticamente por trg_case_status_history, nunca a mano. */
@Entity({ schema: 'operations', name: 'case_status_history' })
export class CaseStatusHistoryEntity extends UuidBaseEntity {
  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @ManyToOne(() => EmergencyCaseEntity)
  @JoinColumn({ name: 'case_id' })
  case?: EmergencyCaseEntity;

  @Column({ name: 'status_from', type: 'uuid', nullable: true })
  statusFrom?: string;

  @Column({ name: 'status_to', type: 'uuid' })
  statusTo: string;

  @Column({ name: 'priority_from', type: 'uuid', nullable: true })
  priorityFrom?: string;

  @Column({ name: 'priority_to', type: 'uuid', nullable: true })
  priorityTo?: string;

  /** FK a params.catalog_values (dominio CHANGED_BY_TYPE). */
  @Column({ name: 'changed_by_type_id', type: 'uuid', nullable: true })
  changedByTypeId?: string;

  @Column({ name: 'changed_by_id', type: 'uuid', nullable: true })
  changedById?: string;

  @Column({ name: 'changed_by_name', type: 'text', nullable: true })
  changedByName?: string;

  @Column({ type: 'text', nullable: true })
  reason?: string;

  @Column({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;
}
