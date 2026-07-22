import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { TenantEntity } from './tenant.entity';
import { TenantAppVariantEntity } from './tenant-app-variant.entity';

@Entity({ schema: 'core', name: 'tenant_brand_profiles' })
export class TenantBrandProfileEntity extends UuidBaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => TenantEntity)
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  @Column({ name: 'variant_id', type: 'uuid', nullable: true })
  variantId?: string;

  @ManyToOne(() => TenantAppVariantEntity)
  @JoinColumn({ name: 'variant_id' })
  variant?: TenantAppVariantEntity;

  /** FK a params.tenant_themes. */
  @Column({ name: 'theme_id', type: 'uuid', nullable: true })
  themeId?: string;

  @Column({ name: 'logo_url', type: 'varchar', length: 500, nullable: true })
  logoUrl?: string;

  @Column({
    name: 'logo_dark_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  logoDarkUrl?: string;

  @Column({
    name: 'logo_icon_url',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  logoIconUrl?: string;

  @Column({ name: 'favicon_url', type: 'varchar', length: 500, nullable: true })
  faviconUrl?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
