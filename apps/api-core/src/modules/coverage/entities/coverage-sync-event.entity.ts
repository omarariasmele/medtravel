import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { TravelAssistanceEnrollmentEntity } from './travel-assistance-enrollment.entity';

export type SyncFailureType =
  'NETWORK_ERROR' | 'AUTH_ERROR' | 'PARTNER_ERROR' | 'TIMEOUT' | 'UNKNOWN';

/** Consumida por la cola BullMQ `coverage-sync` (ver src/modules/jobs). */
@Entity({ schema: 'coverage', name: 'coverage_sync_events' })
export class CoverageSyncEventEntity extends UuidBaseEntity {
  @Column({ name: 'enrollment_id', type: 'uuid' })
  enrollmentId: string;

  @ManyToOne(() => TravelAssistanceEnrollmentEntity)
  @JoinColumn({ name: 'enrollment_id' })
  enrollment?: TravelAssistanceEnrollmentEntity;

  /** FK a params.catalog_values (dominio SYNC_TYPE). */
  @Column({ name: 'sync_type_id', type: 'uuid' })
  syncTypeId: string;

  @Column({ type: 'varchar', length: 50 })
  source: string;

  /** FK a params.catalog_values (dominio SYNC_EVENT_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'changes_detected', type: 'jsonb', default: {} })
  changesDetected: Record<string, unknown>;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({
    name: 'failure_type',
    type: 'varchar',
    length: 20,
    nullable: true,
  })
  failureType?: SyncFailureType;

  @Column({ name: 'retry_count', type: 'smallint', default: 0 })
  retryCount: number;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ name: 'next_retry_at', type: 'timestamptz', nullable: true })
  nextRetryAt?: Date;
}
