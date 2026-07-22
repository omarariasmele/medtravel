import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { EmergencyCaseEntity } from './emergency-case.entity';

/** Inmutable — tracking de ubicación del member durante un caso activo. */
@Entity({ schema: 'operations', name: 'case_location_history' })
export class CaseLocationHistoryEntity extends UuidBaseEntity {
  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @ManyToOne(() => EmergencyCaseEntity)
  @JoinColumn({ name: 'case_id' })
  case?: EmergencyCaseEntity;

  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @Column({ type: 'numeric', precision: 10, scale: 8 })
  latitude: string;

  @Column({ type: 'numeric', precision: 11, scale: 8 })
  longitude: string;

  @Column({
    name: 'accuracy_meters',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  accuracyMeters?: string;

  @Column({ name: 'battery_pct', type: 'smallint', nullable: true })
  batteryPct?: number;

  @Column({ name: 'has_internet', type: 'boolean', nullable: true })
  hasInternet?: boolean;

  @Column({ name: 'recorded_at', type: 'timestamptz' })
  recordedAt: Date;
}
