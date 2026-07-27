import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { UserEntity } from './user.entity';

@Entity({ schema: 'core', name: 'password_reset_tokens' })
export class PasswordResetTokenEntity extends UuidBaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'token_hash', type: 'text', unique: true })
  tokenHash: string;

  /** TTL leído de params.operational_limits en runtime (B9), no hardcodeado. */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'boolean', default: false })
  used: boolean;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt?: Date;

  @Column({ name: 'request_ip', type: 'inet', nullable: true })
  requestIp?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
