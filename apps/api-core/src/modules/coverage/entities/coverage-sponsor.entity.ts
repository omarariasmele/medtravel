import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

@Entity({ schema: 'coverage', name: 'coverage_sponsors' })
export class CoverageSponsorEntity extends UuidBaseEntity {
  /** FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** FK a params.catalog_values (dominio SPONSOR_TYPE). */
  @Column({ name: 'sponsor_type_id', type: 'uuid' })
  sponsorTypeId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  code?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
