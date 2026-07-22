import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * RLS (cases_access, 007_operations.sql): tenant ve sus casos, titular ve
 * los suyos — sin bypass de superadmin (break-glass va por
 * audit.break_glass_grants). tenant_id y member_id son inmutables tras el
 * INSERT (trg_cases_ownership_immutable, C10). case_number se genera en DB
 * vía operations.generate_case_number() — no generarlo en la app.
 * sla_target_seconds se completa por trigger (fill_sla_target) desde
 * params.operational_limits si se omite en el INSERT.
 */
@Entity({ schema: 'operations', name: 'emergency_cases' })
export class EmergencyCaseEntity extends UuidBaseEntity {
  @Column({ name: 'case_number', type: 'text', unique: true })
  caseNumber: string;

  /** FK a core.members — inmutable tras INSERT. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  /** FK a core.tenants — inmutable tras INSERT. */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'enrollment_id', type: 'uuid', nullable: true })
  enrollmentId?: string;

  @Column({ name: 'trip_id', type: 'uuid', nullable: true })
  tripId?: string;

  @Column({ name: 'destination_id', type: 'uuid', nullable: true })
  destinationId?: string;

  /** FK a params.catalog_values (dominio DESTINATION_DETECTION_METHOD). */
  @Column({ name: 'destination_detected_by_id', type: 'uuid', nullable: true })
  destinationDetectedById?: string;

  /** FK a params.catalog_values (dominio CASE_ORIGIN). */
  @Column({ name: 'origin_id', type: 'uuid' })
  originId: string;

  /** FK a params.catalog_values (dominio EMERGENCY_TYPE). */
  @Column({ name: 'emergency_type_id', type: 'uuid', nullable: true })
  emergencyTypeId?: string;

  /** FK a params.catalog_values (dominio CASE_PRIORITY). */
  @Column({ name: 'priority_id', type: 'uuid' })
  priorityId: string;

  /** FK a params.catalog_values (dominio CASE_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'initial_description', type: 'text', nullable: true })
  initialDescription?: string;

  @Column({ name: 'patient_symptoms', type: 'text', nullable: true })
  patientSymptoms?: string;

  @Column({ name: 'patient_conscious', type: 'boolean', nullable: true })
  patientConscious?: boolean;

  @Column({
    name: 'incident_latitude',
    type: 'numeric',
    precision: 10,
    scale: 8,
    nullable: true,
  })
  incidentLatitude?: string;

  @Column({
    name: 'incident_longitude',
    type: 'numeric',
    precision: 11,
    scale: 8,
    nullable: true,
  })
  incidentLongitude?: string;

  @Column({
    name: 'incident_location_acc',
    type: 'numeric',
    precision: 6,
    scale: 2,
    nullable: true,
  })
  incidentLocationAcc?: string;

  /** FK a params.catalog_values (dominio LOCATION_SOURCE). */
  @Column({ name: 'location_source_id', type: 'uuid', nullable: true })
  locationSourceId?: string;

  /** FK a operations.operators. */
  @Column({ name: 'assigned_operator_id', type: 'uuid', nullable: true })
  assignedOperatorId?: string;

  @Column({ name: 'assigned_at', type: 'timestamptz', nullable: true })
  assignedAt?: Date;

  @Column({ name: 'first_response_at', type: 'timestamptz', nullable: true })
  firstResponseAt?: Date;

  /** B11: se completa por trigger desde operational_limits si viene NULL. */
  @Column({ name: 'sla_target_seconds', type: 'int', nullable: true })
  slaTargetSeconds?: number;

  /** FK a params.catalog_values (dominio CASE_RESOLUTION_TYPE). */
  @Column({ name: 'resolution_type_id', type: 'uuid', nullable: true })
  resolutionTypeId?: string;

  @Column({ name: 'resolution_notes', type: 'text', nullable: true })
  resolutionNotes?: string;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt?: Date;

  @Column({ name: 'closed_by', type: 'uuid', nullable: true })
  closedBy?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
