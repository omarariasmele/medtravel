import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * Pedido explícito del usuario (mockup de Historial de Salud): no
 * existía ninguna tabla para implantes/dispositivos (ej. marcapasos) —
 * hoy solo vivía como texto libre suelto dentro de una cirugía
 * puntual (clinical.surgeries.implant_details), que no sirve para
 * listarlos de forma independiente. Mismo patrón RLS/inmutabilidad
 * que AllergyEntity.
 */
@Entity({ schema: 'clinical', name: 'implants_devices' })
export class ImplantDeviceEntity extends UuidBaseEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  @Column({ name: 'device_name', type: 'text' })
  deviceName: string;

  /** FK a params.catalog_values (dominio IMPLANT_TYPE). */
  @Column({ name: 'device_type_id', type: 'uuid', nullable: true })
  deviceTypeId?: string;

  @Column({ name: 'implanted_at', type: 'date', nullable: true })
  implantedAt?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'canonical_status_id', type: 'uuid' })
  canonicalStatusId: string;

  @Column({ name: 'confirmation_status_id', type: 'uuid', nullable: true })
  confirmationStatusId?: string;

  @Column({ name: 'certification_status_id', type: 'uuid', nullable: true })
  certificationStatusId?: string;

  @Column({ name: 'member_confirmed', type: 'boolean', default: false })
  memberConfirmed: boolean;

  @Column({ name: 'member_confirmed_at', type: 'timestamptz', nullable: true })
  memberConfirmedAt?: Date;

  @Column({ name: 'member_challenged', type: 'boolean', default: false })
  memberChallenged: boolean;

  @Column({ name: 'member_challenge_notes', type: 'text', nullable: true })
  memberChallengeNotes?: string;

  @Column({ name: 'provenance_id', type: 'uuid' })
  provenanceId: string;

  @Column({
    name: 'requires_member_confirmation',
    type: 'boolean',
    default: true,
  })
  requiresMemberConfirmation: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'deletion_reason_id', type: 'uuid', nullable: true })
  deletionReasonId?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
