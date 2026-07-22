import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * MTA-511 (cambio #6): reemplaza el viejo EMERGENCY_OFFLINE sin vencimiento
 * — expires_at es siempre obligatorio, calculado desde
 * params.operational_limits.TOKEN_OFFLINE_ACCESS_MAX_HOURS.
 */
@Entity({ schema: 'emergency', name: 'signed_offline_access' })
export class SignedOfflineAccessEntity extends UuidBaseEntity {
  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @Column({ name: 'signed_payload', type: 'text' })
  signedPayload: string;

  @Column({ type: 'text' })
  signature: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'last_sync_at', type: 'timestamptz', nullable: true })
  lastSyncAt?: Date;

  @Column({ name: 'show_sync_warning', type: 'boolean', default: false })
  showSyncWarning: boolean;

  @Column({
    name: 'sync_warning_threshold_hours',
    type: 'smallint',
    default: 24,
  })
  syncWarningThresholdHours: number;

  /** FK a params.catalog_values (dominio OFFLINE_ACCESS_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  @Column({ name: 'revoke_reason', type: 'text', nullable: true })
  revokeReason?: string;
}
