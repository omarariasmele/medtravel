import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

@Entity({ schema: 'operations', name: 'trips' })
export class TripEntity extends UuidBaseEntity {
  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  /** FK a coverage.travel_assistance_enrollments. */
  @Column({ name: 'enrollment_id', type: 'uuid', nullable: true })
  enrollmentId?: string;

  @Column({ name: 'trip_name', type: 'text', nullable: true })
  tripName?: string;

  @Column({ name: 'trip_start', type: 'date' })
  tripStart: string;

  @Column({ name: 'trip_end', type: 'date' })
  tripEnd: string;

  /** FK a params.catalog_values (dominio TRIP_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
