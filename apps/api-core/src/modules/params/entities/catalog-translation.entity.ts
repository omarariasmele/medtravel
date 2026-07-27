import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { CatalogValueEntity } from './catalog-value.entity';

@Entity({ schema: 'params', name: 'catalog_translations' })
@Index(['valueId', 'languageCode'], { unique: true })
export class CatalogTranslationEntity extends UuidBaseEntity {
  @Column({ name: 'value_id', type: 'uuid' })
  valueId: string;

  @ManyToOne(() => CatalogValueEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'value_id' })
  value?: CatalogValueEntity;

  @Column({ name: 'language_code', type: 'char', length: 5 })
  languageCode: string;

  @Column({ type: 'varchar', length: 200 })
  label: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
