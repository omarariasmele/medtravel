import { Column, Entity, Index } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';
import { LifecycleStatus } from './catalog-value.entity';

@Entity({ schema: 'params', name: 'partner_api_profiles' })
@Index(['tenantId', 'profileCode'], { unique: true })
export class PartnerApiProfileEntity extends UuidBaseEntity {
  /** FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'profile_code', type: 'varchar', length: 100 })
  profileCode: string;

  @Column({ name: 'integration_type', type: 'varchar', length: 30 })
  integrationType: string;

  @Column({ name: 'base_url', type: 'text' })
  baseUrl: string;

  @Column({ name: 'auth_type', type: 'varchar', length: 20 })
  authType: string;

  @Column({ name: 'auth_config', type: 'jsonb', default: {} })
  authConfig: Record<string, unknown>;

  @Column({ name: 'timeout_ms', type: 'int', default: 30000 })
  timeoutMs: number;

  @Column({ name: 'retry_attempts', type: 'smallint', default: 3 })
  retryAttempts: number;

  @Column({ name: 'retry_delay_ms', type: 'int', default: 1000 })
  retryDelayMs: number;

  @Column({
    name: 'lifecycle_status',
    type: 'varchar',
    length: 20,
    default: 'ACTIVE',
  })
  lifecycleStatus: LifecycleStatus;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
