import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { PartnerApiProfileEntity } from './partner-api-profile.entity';

export type FieldMappingDirection = 'IN' | 'OUT' | 'BOTH';

@Entity({ schema: 'params', name: 'field_mappings' })
export class FieldMappingEntity extends UuidBaseEntity {
  @Column({ name: 'profile_id', type: 'uuid' })
  profileId: string;

  @ManyToOne(() => PartnerApiProfileEntity)
  @JoinColumn({ name: 'profile_id' })
  profile?: PartnerApiProfileEntity;

  @Column({ type: 'varchar', length: 10 })
  direction: FieldMappingDirection;

  @Column({ name: 'source_field', type: 'varchar', length: 200 })
  sourceField: string;

  @Column({ name: 'target_field', type: 'varchar', length: 200 })
  targetField: string;

  @Column({
    name: 'transform_type',
    type: 'varchar',
    length: 30,
    nullable: true,
  })
  transformType?: string;

  @Column({ name: 'transform_config', type: 'jsonb', default: {} })
  transformConfig: Record<string, unknown>;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  isRequired: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
