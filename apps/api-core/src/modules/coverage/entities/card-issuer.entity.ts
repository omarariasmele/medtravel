import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { CardNetworkEntity } from './card-network.entity';

@Entity({ schema: 'coverage', name: 'card_issuers' })
export class CardIssuerEntity extends UuidBaseEntity {
  @Column({ name: 'network_id', type: 'uuid' })
  networkId: string;

  @ManyToOne(() => CardNetworkEntity)
  @JoinColumn({ name: 'network_id' })
  network?: CardNetworkEntity;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  code?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId?: string;

  /** FK a params.partner_api_profiles. */
  @Column({ name: 'api_profile_id', type: 'uuid', nullable: true })
  apiProfileId?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
