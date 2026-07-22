import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { OperatorRoleEntity } from './operator-role.entity';

/** B7: los operadores también se autentican vía core.users (mismo IAM que los profesionales). */
@Entity({ schema: 'operations', name: 'operators' })
export class OperatorEntity extends UuidBaseEntity {
  /** FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @ManyToOne(() => OperatorRoleEntity)
  @JoinColumn({ name: 'role_id' })
  role?: OperatorRoleEntity;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @Column({ name: 'first_name', type: 'text' })
  firstName: string;

  @Column({ name: 'last_name', type: 'text' })
  lastName: string;

  /** FK a params.catalog_values (dominio OPERATOR_TYPE). */
  @Column({ name: 'operator_type_id', type: 'uuid' })
  operatorTypeId: string;

  /** FK a params.catalog_values (dominio MEDICAL_SPECIALTY). */
  @Column({ name: 'specialty_id', type: 'uuid', nullable: true })
  specialtyId?: string;

  @Column({ name: 'license_number', type: 'text', nullable: true })
  licenseNumber?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'license_country_id', type: 'uuid', nullable: true })
  licenseCountryId?: string;

  @Column({ type: 'text', array: true, default: ['es'] })
  languages: string[];

  @Column({
    type: 'varchar',
    length: 50,
    default: 'America/Argentina/Buenos_Aires',
  })
  timezone: string;

  /** FK a params.catalog_values (dominio OPERATOR_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  /** FK a params.catalog_values (dominio OPERATOR_PRESENCE_STATUS). */
  @Column({ name: 'presence_status_id', type: 'uuid', nullable: true })
  presenceStatusId?: string;

  @Column({ name: 'active_cases_count', type: 'smallint', default: 0 })
  activeCasesCount: number;

  @Column({ name: 'max_cases', type: 'smallint', default: 3 })
  maxCases: number;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl?: string;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt?: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
