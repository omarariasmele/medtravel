import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { HealthcareProfessionalEntity } from './healthcare-professional.entity';

/**
 * RLS: encounters_access — has_clinical_access(person_id) O el profesional
 * autor (professional_id → user_id = app.current_user_id).
 */
@Entity({ schema: 'clinical', name: 'encounters' })
export class EncounterEntity extends UuidBaseEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId: string;

  @ManyToOne(() => HealthcareProfessionalEntity)
  @JoinColumn({ name: 'professional_id' })
  professional?: HealthcareProfessionalEntity;

  @Column({ name: 'encounter_date', type: 'date' })
  encounterDate: string;

  /** FK a params.catalog_values (dominio ENCOUNTER_TYPE). */
  @Column({ name: 'encounter_type_id', type: 'uuid' })
  encounterTypeId: string;

  @Column({ name: 'chief_complaint', type: 'text', nullable: true })
  chiefComplaint?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  /** FK a params.catalog_values (dominio ENCOUNTER_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
