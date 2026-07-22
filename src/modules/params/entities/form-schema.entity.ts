import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';
import { LifecycleStatus } from './catalog-value.entity';

@Entity({ schema: 'params', name: 'form_schemas' })
export class FormSchemaEntity extends UuidBaseEntity {
  /** NULL = form global. FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'varchar', length: 100 })
  code: string;

  @Column({ name: 'name_es', type: 'varchar', length: 200 })
  nameEs: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId?: string;

  @Column({ name: 'plan_type', type: 'varchar', length: 100, nullable: true })
  planType?: string;

  @Column({ type: 'smallint', default: 1 })
  version: number;

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
