import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * RLS (core.persons, B3 en 003_core_identity.sql): solo el propio titular
 * (id = app.current_person_id) puede leer su fila directamente. El acceso
 * de un tenant/operador a datos de personas pasa por core.members, nunca
 * por esta tabla — no exponer un findAll() ni un findById() genérico acá.
 */
@Entity({ schema: 'core', name: 'persons' })
export class PersonEntity extends UuidBaseEntity {
  @Column({ name: 'first_name', type: 'text' })
  firstName: string;

  @Column({ name: 'last_name', type: 'text' })
  lastName: string;

  @Column({ name: 'birth_date', type: 'date', nullable: true })
  birthDate?: string;

  /** FK a params.catalog_values (dominio GENDER). */
  @Column({ name: 'gender_id', type: 'uuid', nullable: true })
  genderId?: string;

  /** FK a params.catalog_values (dominio NATIONALITY). */
  @Column({ name: 'nationality_id', type: 'uuid', nullable: true })
  nationalityId?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_residence_id', type: 'uuid', nullable: true })
  countryResidenceId?: string;

  @Column({ name: 'preferred_lang', type: 'char', length: 5, default: 'es' })
  preferredLang: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: 'America/Argentina/Buenos_Aires',
  })
  timezone: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
