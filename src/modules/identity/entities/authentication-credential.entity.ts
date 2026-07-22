import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { UserEntity } from './user.entity';

@Entity({ schema: 'core', name: 'authentication_credentials' })
export class AuthenticationCredentialEntity extends UuidBaseEntity {
  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  /** bcrypt/argon2 — nunca loguear ni exponer este campo. */
  @Column({ name: 'password_hash', type: 'text' })
  passwordHash: string;

  @Column({ name: 'created_by_user_at', type: 'timestamptz' })
  createdByUserAt: Date;

  @Column({ name: 'last_changed_at', type: 'timestamptz' })
  lastChangedAt: Date;

  @Column({ name: 'must_change', type: 'boolean', default: false })
  mustChange: boolean;

  @Column({ name: 'failed_attempts', type: 'smallint', default: 0 })
  failedAttempts: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil?: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
