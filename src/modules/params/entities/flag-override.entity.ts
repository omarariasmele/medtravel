import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { FeatureFlagEntity } from './feature-flag.entity';

export type FlagOverrideScope = 'TENANT' | 'COUNTRY' | 'PLAN' | 'MEMBER';

@Entity({ schema: 'params', name: 'flag_overrides' })
export class FlagOverrideEntity extends UuidBaseEntity {
  @Column({ name: 'flag_id', type: 'uuid' })
  flagId: string;

  @ManyToOne(() => FeatureFlagEntity)
  @JoinColumn({ name: 'flag_id' })
  flag?: FeatureFlagEntity;

  @Column({ name: 'scope_type', type: 'varchar', length: 20 })
  scopeType: FlagOverrideScope;

  @Column({ name: 'scope_id', type: 'uuid' })
  scopeId: string;

  @Column({ name: 'override_value', type: 'jsonb' })
  overrideValue: unknown;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom: Date;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil?: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
