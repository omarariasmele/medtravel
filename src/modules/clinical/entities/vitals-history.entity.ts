import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * RLS: clinical_access + vitals_insert; vitals_no_update/vitals_no_delete
 * (USING FALSE) — es un historial append-only, nunca editar una medición ya
 * guardada. `bmi` es GENERATED ALWAYS ... STORED en Postgres: no escribirlo
 * desde la app (insert/update deshabilitados acá).
 */
@Entity({ schema: 'clinical', name: 'vitals_history' })
export class VitalsHistoryEntity extends UuidBaseEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  @Column({
    name: 'weight_kg',
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  weightKg?: string;

  @Column({
    name: 'height_cm',
    type: 'numeric',
    precision: 5,
    scale: 1,
    nullable: true,
  })
  heightCm?: string;

  @Column({
    name: 'waist_cm',
    type: 'numeric',
    precision: 5,
    scale: 1,
    nullable: true,
  })
  waistCm?: string;

  /** Columna calculada por Postgres (GENERATED ALWAYS ... STORED). */
  @Column({
    type: 'numeric',
    precision: 4,
    scale: 2,
    nullable: true,
    insert: false,
    update: false,
  })
  bmi?: string;

  @Column({ name: 'blood_pressure_sys', type: 'smallint', nullable: true })
  bloodPressureSys?: number;

  @Column({ name: 'blood_pressure_dia', type: 'smallint', nullable: true })
  bloodPressureDia?: number;

  @Column({ name: 'heart_rate', type: 'smallint', nullable: true })
  heartRate?: number;

  @Column({ name: 'respiratory_rate', type: 'smallint', nullable: true })
  respiratoryRate?: number;

  @Column({
    name: 'temperature_c',
    type: 'numeric',
    precision: 4,
    scale: 1,
    nullable: true,
  })
  temperatureC?: string;

  @Column({
    name: 'oxygen_saturation',
    type: 'numeric',
    precision: 4,
    scale: 1,
    nullable: true,
  })
  oxygenSaturation?: string;

  @Column({
    name: 'blood_glucose',
    type: 'numeric',
    precision: 5,
    scale: 1,
    nullable: true,
  })
  bloodGlucose?: string;

  /** FK a params.catalog_values (dominio BLOOD_TYPE). */
  @Column({ name: 'blood_type_id', type: 'uuid', nullable: true })
  bloodTypeId?: string;

  @Column({ name: 'measured_at', type: 'timestamptz' })
  measuredAt: Date;

  /** FK a params.catalog_values (dominio MEASURED_BY). */
  @Column({ name: 'measured_by_id', type: 'uuid', nullable: true })
  measuredById?: string;

  /** FK a params.catalog_values (dominio VITALS_CONTEXT). */
  @Column({ name: 'context_id', type: 'uuid', nullable: true })
  contextId?: string;

  @Column({ name: 'device_used', type: 'text', nullable: true })
  deviceUsed?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId?: string;

  @Column({ name: 'provenance_id', type: 'uuid' })
  provenanceId: string;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
