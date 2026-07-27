import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { TenantEntity } from './tenant.entity';

@Entity({ schema: 'core', name: 'tenant_app_variants' })
export class TenantAppVariantEntity extends UuidBaseEntity {
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => TenantEntity)
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  /** FK a params.catalog_values (dominio APP_VARIANT_TYPE). */
  @Column({ name: 'variant_type_id', type: 'uuid' })
  variantTypeId: string;

  @Column({ name: 'bundle_id', type: 'varchar', length: 200, nullable: true })
  bundleId?: string;

  @Column({ name: 'app_name', type: 'varchar', length: 200 })
  appName: string;

  @Column({
    name: 'store_url_ios',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  storeUrlIos?: string;

  @Column({
    name: 'store_url_android',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  storeUrlAndroid?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
