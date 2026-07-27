import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { PersonEntity } from './person.entity';

/**
 * RLS habilitada y forzada en core.users (003_core_identity.sql) pero SIN
 * política CREATE POLICY definida — por diseño, ninguna fila es visible vía
 * el rol app_runtime salvo que se agregue una política explícita o se pase
 * por una función SECURITY DEFINER (mismo patrón que
 * clinical.has_clinical_access). El login (buscar por email_blind_index)
 * necesita esa función — pendiente, no crear un findByEmail() directo acá
 * hasta tenerla.
 */
@Entity({ schema: 'core', name: 'users' })
export class UserEntity extends UuidBaseEntity {
  @Column({ name: 'person_id', type: 'uuid', unique: true })
  personId: string;

  @OneToOne(() => PersonEntity)
  @JoinColumn({ name: 'person_id' })
  person?: PersonEntity;

  @Column({ type: 'bytea' })
  email: Buffer;

  @Column({ name: 'email_blind_index', type: 'text', unique: true })
  emailBlindIndex: string;

  @Column({ name: 'email_verified', type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ type: 'bytea', nullable: true })
  phone?: Buffer;

  @Column({ name: 'phone_blind_index', type: 'text', nullable: true })
  phoneBlindIndex?: string;

  @Column({ name: 'phone_verified', type: 'boolean', default: false })
  phoneVerified: boolean;

  @Column({ name: 'preferred_lang', type: 'char', length: 5, default: 'es' })
  preferredLang: string;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt?: Date;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
