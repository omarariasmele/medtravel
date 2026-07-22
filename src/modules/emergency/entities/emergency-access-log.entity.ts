import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/** Inmutable — sin updated_at, no exponer update/delete en el servicio de este módulo. */
@Entity({ schema: 'emergency', name: 'access_log' })
export class EmergencyAccessLogEntity extends UuidBaseEntity {
  @Column({ name: 'token_id', type: 'uuid', nullable: true })
  tokenId?: string;

  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  /** FK a params.catalog_values (dominio ACCESSOR_TYPE). */
  @Column({ name: 'accessor_type_id', type: 'uuid' })
  accessorTypeId: string;

  @Column({ name: 'accessor_name', type: 'text', nullable: true })
  accessorName?: string;

  @Column({ name: 'accessor_email', type: 'text', nullable: true })
  accessorEmail?: string;

  @Column({ name: 'accessor_specialty', type: 'text', nullable: true })
  accessorSpecialty?: string;

  @Column({ name: 'accessor_company', type: 'text', nullable: true })
  accessorCompany?: string;

  @Column({ name: 'access_ip', type: 'inet', nullable: true })
  accessIp?: string;

  @Column({ name: 'access_country', type: 'char', length: 2, nullable: true })
  accessCountry?: string;

  @Column({ name: 'access_city', type: 'text', nullable: true })
  accessCity?: string;

  /** FK a params.catalog_values (dominio DEVICE_TYPE). */
  @Column({ name: 'device_type_id', type: 'uuid', nullable: true })
  deviceTypeId?: string;

  /** FK a params.catalog_values (dominio ACCESS_METHOD). */
  @Column({ name: 'access_method_id', type: 'uuid' })
  accessMethodId: string;

  @Column({
    name: 'sections_viewed',
    type: 'text',
    array: true,
    nullable: true,
  })
  sectionsViewed?: string[];

  @Column({
    name: 'documents_viewed',
    type: 'uuid',
    array: true,
    nullable: true,
  })
  documentsViewed?: string[];

  @Column({ name: 'view_duration_sec', type: 'int', nullable: true })
  viewDurationSec?: number;

  @Column({ name: 'display_language', type: 'char', length: 5, nullable: true })
  displayLanguage?: string;

  @Column({ name: 'was_translated', type: 'boolean', default: false })
  wasTranslated: boolean;

  @Column({ name: 'access_granted', type: 'boolean' })
  accessGranted: boolean;

  @Column({ name: 'denial_reason', type: 'text', nullable: true })
  denialReason?: string;

  @Column({ name: 'doctor_left_note', type: 'boolean', default: false })
  doctorLeftNote: boolean;

  @Column({ name: 'accessed_at', type: 'timestamptz' })
  accessedAt: Date;
}
