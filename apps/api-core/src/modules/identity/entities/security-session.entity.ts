import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { UserEntity } from './user.entity';

/** RLS: sessions_self — solo user_id = app.current_user_id (003_core_identity.sql). */
@Entity({ schema: 'core', name: 'security_sessions' })
export class SecuritySessionEntity extends UuidBaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ name: 'session_token_hash', type: 'text', unique: true })
  sessionTokenHash: string;

  @Column({
    name: 'refresh_token_hash',
    type: 'text',
    unique: true,
    nullable: true,
  })
  refreshTokenHash?: string;

  @Column({ name: 'device_fingerprint', type: 'text', nullable: true })
  deviceFingerprint?: string;

  @Column({ name: 'device_name', type: 'text', nullable: true })
  deviceName?: string;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress?: string;

  /** FK a params.catalog_values (dominio DEVICE_TYPE). */
  @Column({ name: 'device_type_id', type: 'uuid', nullable: true })
  deviceTypeId?: string;

  /** TTL leído de params.operational_limits en runtime (B9). */
  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'last_activity_at', type: 'timestamptz' })
  lastActivityAt: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  /** FK a params.catalog_values (dominio SESSION_REVOKE_REASON). */
  @Column({ name: 'revoke_reason_id', type: 'uuid', nullable: true })
  revokeReasonId?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
