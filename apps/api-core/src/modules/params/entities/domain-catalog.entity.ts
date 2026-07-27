import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

@Entity({ schema: 'params', name: 'domain_catalogs' })
export class DomainCatalogEntity extends UuidBaseEntity {
  @Column({ type: 'varchar', length: 100, unique: true })
  code: string;

  @Column({ name: 'name_es', type: 'varchar', length: 200 })
  nameEs: string;

  @Column({ name: 'name_en', type: 'varchar', length: 200, nullable: true })
  nameEn?: string;

  @Column({ name: 'name_pt', type: 'varchar', length: 200, nullable: true })
  namePt?: string;

  @Column({ name: 'description_es', type: 'text', nullable: true })
  descriptionEs?: string;

  @Column({ name: 'allows_tenant_override', type: 'boolean', default: false })
  allowsTenantOverride: boolean;

  @Column({ name: 'allows_custom_values', type: 'boolean', default: false })
  allowsCustomValues: boolean;

  @Column({ name: 'is_ordered', type: 'boolean', default: false })
  isOrdered: boolean;

  @Column({ name: 'is_system', type: 'boolean', default: true })
  isSystem: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
