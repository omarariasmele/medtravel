import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import {
  DesignTokenSetEntity,
  TokenSetPlatform,
} from './design-token-set.entity';

@Entity({ schema: 'params', name: 'tenant_themes' })
export class TenantThemeEntity extends UuidBaseEntity {
  /** FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'token_set_id', type: 'uuid', nullable: true })
  tokenSetId?: string;

  @ManyToOne(() => DesignTokenSetEntity)
  @JoinColumn({ name: 'token_set_id' })
  tokenSet?: DesignTokenSetEntity;

  @Column({ name: 'theme_name', type: 'varchar', length: 100 })
  themeName: string;

  @Column({ type: 'varchar', length: 10 })
  platform: TokenSetPlatform;

  @Column({ name: 'color_primary', type: 'char', length: 7, nullable: true })
  colorPrimary?: string;

  @Column({ name: 'color_secondary', type: 'char', length: 7, nullable: true })
  colorSecondary?: string;

  @Column({ name: 'color_accent', type: 'char', length: 7, nullable: true })
  colorAccent?: string;

  @Column({ name: 'color_success', type: 'char', length: 7, nullable: true })
  colorSuccess?: string;

  @Column({ name: 'color_warning', type: 'char', length: 7, nullable: true })
  colorWarning?: string;

  @Column({ name: 'color_danger', type: 'char', length: 7, nullable: true })
  colorDanger?: string;

  @Column({ name: 'color_bg_primary', type: 'char', length: 7, nullable: true })
  colorBgPrimary?: string;

  @Column({
    name: 'color_text_primary',
    type: 'char',
    length: 7,
    nullable: true,
  })
  colorTextPrimary?: string;

  @Column({
    name: 'color_emergency_alert',
    type: 'char',
    length: 7,
    nullable: true,
  })
  colorEmergencyAlert?: string;

  @Column({
    name: 'font_family_primary',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  fontFamilyPrimary?: string;

  @Column({ name: 'font_size_base', type: 'smallint', nullable: true })
  fontSizeBase?: number;

  @Column({ name: 'border_radius_md', type: 'smallint', nullable: true })
  borderRadiusMd?: number;

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

  @Column({
    name: 'splash_bg_color',
    type: 'char',
    length: 7,
    nullable: true,
  })
  splashBgColor?: string;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
