import { Column, Entity, Index } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/** B8: sin currency ni limit_amount — los montos se consultan al partner por API. */
@Entity({ schema: 'coverage', name: 'assistance_plans' })
@Index(['tenantId', 'code'], { unique: true })
export class AssistancePlanEntity extends UuidBaseEntity {
  /** FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  /** FK a params.catalog_values (dominio PLAN_TYPE). */
  @Column({ name: 'plan_type_id', type: 'uuid' })
  planTypeId: string;

  @Column({
    name: 'coverage_regions',
    type: 'text',
    array: true,
    nullable: true,
  })
  coverageRegions?: string[];

  @Column({ name: 'max_trip_days', type: 'smallint', nullable: true })
  maxTripDays?: number;

  @Column({ name: 'max_age', type: 'smallint', nullable: true })
  maxAge?: number;

  @Column({ name: 'commercial_info_url', type: 'text', nullable: true })
  commercialInfoUrl?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
