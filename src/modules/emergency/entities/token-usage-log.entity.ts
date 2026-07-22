import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/** Inmutable — registra cada intento de uso de un token, exitoso o no (anti-replay). */
@Entity({ schema: 'emergency', name: 'token_usage_log' })
export class TokenUsageLogEntity extends UuidBaseEntity {
  @Column({ name: 'token_id', type: 'uuid', nullable: true })
  tokenId?: string;

  @Column({ name: 'token_value_attempted', type: 'text', nullable: true })
  tokenValueAttempted?: string;

  @Column({ name: 'check_token_exists', type: 'boolean', nullable: true })
  checkTokenExists?: boolean;

  @Column({ name: 'check_not_expired', type: 'boolean', nullable: true })
  checkNotExpired?: boolean;

  @Column({ name: 'check_not_revoked', type: 'boolean', nullable: true })
  checkNotRevoked?: boolean;

  @Column({ name: 'check_hmac_valid', type: 'boolean', nullable: true })
  checkHmacValid?: boolean;

  @Column({ name: 'check_replay', type: 'boolean', nullable: true })
  checkReplay?: boolean;

  @Column({ name: 'access_granted', type: 'boolean' })
  accessGranted: boolean;

  @Column({ name: 'denial_reason', type: 'text', nullable: true })
  denialReason?: string;

  @Column({ name: 'attempt_ip', type: 'inet', nullable: true })
  attemptIp?: string;

  @Column({ name: 'attempt_country', type: 'char', length: 2, nullable: true })
  attemptCountry?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @Column({ name: 'attempted_at', type: 'timestamptz' })
  attemptedAt: Date;
}
