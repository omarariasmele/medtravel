import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { OperatorEntity } from './operator.entity';

@Entity({ schema: 'operations', name: 'operator_sessions' })
export class OperatorSessionEntity extends UuidBaseEntity {
  @Column({ name: 'operator_id', type: 'uuid' })
  operatorId: string;

  @ManyToOne(() => OperatorEntity)
  @JoinColumn({ name: 'operator_id' })
  operator?: OperatorEntity;

  @Column({ name: 'session_token', type: 'text', unique: true })
  sessionToken: string;

  @Column({ name: 'refresh_token', type: 'text', unique: true, nullable: true })
  refreshToken?: string;

  /** FK a params.catalog_values (dominio DEVICE_TYPE). */
  @Column({ name: 'device_type_id', type: 'uuid', nullable: true })
  deviceTypeId?: string;

  @Column({ name: 'device_name', type: 'text', nullable: true })
  deviceName?: string;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @Column({ name: 'country_detected', type: 'char', length: 2, nullable: true })
  countryDetected?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'last_activity_at', type: 'timestamptz' })
  lastActivityAt: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date;
}
