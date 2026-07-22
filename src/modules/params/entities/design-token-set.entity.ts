import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';
import { LifecycleStatus } from './catalog-value.entity';

export type TokenSetPlatform = 'APP' | 'WEB' | 'BOTH';

@Entity({ schema: 'params', name: 'design_token_sets' })
export class DesignTokenSetEntity extends UuidBaseEntity {
  /** NULL = set global. FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 10 })
  platform: TokenSetPlatform;

  @Column({ type: 'jsonb', default: {} })
  tokens: Record<string, unknown>;

  @Column({
    name: 'lifecycle_status',
    type: 'varchar',
    length: 20,
    default: 'ACTIVE',
  })
  lifecycleStatus: LifecycleStatus;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'supports_dark_mode', type: 'boolean', default: false })
  supportsDarkMode: boolean;

  @Column({ name: 'dark_tokens', type: 'jsonb', default: {} })
  darkTokens: Record<string, unknown>;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
