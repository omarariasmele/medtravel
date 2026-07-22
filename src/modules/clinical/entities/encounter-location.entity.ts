import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { EncounterEntity } from './encounter.entity';
import { HealthcareOrganizationEntity } from './healthcare-organization.entity';

/** CHECK location_has_data: organization_id o free_text_name, al menos uno. */
@Entity({ schema: 'clinical', name: 'encounter_locations' })
export class EncounterLocationEntity extends UuidBaseEntity {
  @Column({ name: 'encounter_id', type: 'uuid' })
  encounterId: string;

  @ManyToOne(() => EncounterEntity)
  @JoinColumn({ name: 'encounter_id' })
  encounter?: EncounterEntity;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string;

  @ManyToOne(() => HealthcareOrganizationEntity)
  @JoinColumn({ name: 'organization_id' })
  organization?: HealthcareOrganizationEntity;

  /** FK a params.catalog_values (dominio ENCOUNTER_LOCATION_TYPE). */
  @Column({ name: 'location_type_id', type: 'uuid' })
  locationTypeId: string;

  @Column({ name: 'free_text_name', type: 'text', nullable: true })
  freeTextName?: string;

  @Column({ name: 'free_text_address', type: 'text', nullable: true })
  freeTextAddress?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId?: string;

  @Column({ type: 'text', nullable: true })
  city?: string;

  @Column({ name: 'department_unit', type: 'text', nullable: true })
  departmentUnit?: string;

  @Column({ name: 'room_or_office', type: 'text', nullable: true })
  roomOrOffice?: string;

  @Column({ name: 'was_emergency', type: 'boolean', default: false })
  wasEmergency: boolean;

  @Column({ type: 'numeric', precision: 10, scale: 8, nullable: true })
  latitude?: string;

  @Column({ type: 'numeric', precision: 11, scale: 8, nullable: true })
  longitude?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
