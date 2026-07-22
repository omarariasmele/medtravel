import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { TripEntity } from './trip.entity';

@Entity({ schema: 'operations', name: 'trip_destinations' })
export class TripDestinationEntity extends UuidBaseEntity {
  @Column({ name: 'trip_id', type: 'uuid' })
  tripId: string;

  @ManyToOne(() => TripEntity)
  @JoinColumn({ name: 'trip_id' })
  trip?: TripEntity;

  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid' })
  countryId: string;

  @Column({ type: 'text' })
  city: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ type: 'numeric', precision: 10, scale: 8, nullable: true })
  latitude?: string;

  @Column({ type: 'numeric', precision: 11, scale: 8, nullable: true })
  longitude?: string;

  @Column({ name: 'arrival_date', type: 'date' })
  arrivalDate: string;

  @Column({ name: 'departure_date', type: 'date' })
  departureDate: string;

  @Column({ name: 'sequence_order', type: 'smallint' })
  sequenceOrder: number;

  /** FK a params.catalog_values (dominio DESTINATION_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'ai_alerts_generated', type: 'boolean', default: false })
  aiAlertsGenerated: boolean;

  @Column({ name: 'ai_alerts', type: 'jsonb', default: [] })
  aiAlerts: unknown[];

  @Column({ name: 'ai_alerts_seen', type: 'boolean', default: false })
  aiAlertsSeen: boolean;

  @Column({ name: 'health_risks', type: 'text', array: true, nullable: true })
  healthRisks?: string[];

  @Column({ name: 'requires_vaccine', type: 'boolean', default: false })
  requiresVaccine: boolean;

  @Column({ name: 'vaccine_required_name', type: 'text', nullable: true })
  vaccineRequiredName?: string;

  @Column({ name: 'local_emergency_info', type: 'jsonb', default: {} })
  localEmergencyInfo: Record<string, unknown>;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
