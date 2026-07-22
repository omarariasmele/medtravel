import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { PartnerApiProfileEntity } from './partner-api-profile.entity';

@Entity({ schema: 'params', name: 'integration_contracts' })
export class IntegrationContractEntity extends UuidBaseEntity {
  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  @ManyToOne(() => PartnerApiProfileEntity)
  @JoinColumn({ name: 'profile_id' })
  profile?: PartnerApiProfileEntity;

  @Column({ name: 'contract_version', type: 'varchar', length: 20 })
  contractVersion: string;

  @Column({ name: 'schema_definition', type: 'jsonb' })
  schemaDefinition: unknown;

  @Column({ name: 'valid_from', type: 'date' })
  validFrom: string;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil?: string;

  @Column({ name: 'is_current', type: 'boolean', default: true })
  isCurrent: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
