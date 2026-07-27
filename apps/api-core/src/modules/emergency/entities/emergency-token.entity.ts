import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * B9/MTA-511: expires_at siempre NOT NULL — el TTL se calcula en runtime
 * leyendo params.operational_limits (ej. TOKEN_DYNAMIC_QR_TTL_SECONDS),
 * nunca hardcodeado en la app. RLS (B10, 007_operations.sql): tokens_titular
 * — solo el propio titular (o un caso activo del tenant) ve sus tokens; el
 * tenant NO los ve por el solo hecho de tener al member en su padrón.
 */
@Entity({ schema: 'emergency', name: 'tokens' })
export class EmergencyTokenEntity extends UuidBaseEntity {
  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  /** FK a params.catalog_values (dominio EMERGENCY_TOKEN_TYPE). */
  @Column({ name: 'token_type_id', type: 'uuid' })
  tokenTypeId: string;

  @Column({ name: 'token_value', type: 'text', unique: true })
  tokenValue: string;

  @Column({ name: 'token_hash', type: 'text' })
  tokenHash: string;

  @Column({ name: 'access_url', type: 'text' })
  accessUrl: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'max_uses', type: 'smallint', nullable: true })
  maxUses?: number;

  @Column({ name: 'use_count', type: 'smallint', default: 0 })
  useCount: number;

  /** FK a params.catalog_values (dominio TOKEN_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'notify_on_use', type: 'boolean', default: true })
  notifyOnUse: boolean;

  @Column({
    type: 'text',
    array: true,
    default: [
      'critical_allergies',
      'critical_conditions',
      'current_medications',
      'emergency_contacts',
    ],
  })
  scope: string[];

  @Column({ name: 'generated_offline', type: 'boolean', default: false })
  generatedOffline: boolean;

  @Column({ name: 'device_id', type: 'text', nullable: true })
  deviceId?: string;

  @Column({ name: 'recipient_name', type: 'text', nullable: true })
  recipientName?: string;

  @Column({ name: 'recipient_email', type: 'text', nullable: true })
  recipientEmail?: string;

  /** FK a params.catalog_values (dominio TOKEN_RECIPIENT_TYPE). */
  @Column({ name: 'recipient_type_id', type: 'uuid', nullable: true })
  recipientTypeId?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
