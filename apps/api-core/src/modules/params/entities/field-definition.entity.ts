import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { FormSchemaEntity } from './form-schema.entity';

@Entity({ schema: 'params', name: 'field_definitions' })
export class FieldDefinitionEntity extends UuidBaseEntity {
  @Column({ name: 'schema_id', type: 'uuid' })
  schemaId: string;

  @ManyToOne(() => FormSchemaEntity)
  @JoinColumn({ name: 'schema_id' })
  schema?: FormSchemaEntity;

  @Column({ name: 'field_key', type: 'varchar', length: 100 })
  fieldKey: string;

  @Column({ name: 'field_type', type: 'varchar', length: 30 })
  fieldType: string;

  @Column({ name: 'label_es', type: 'varchar', length: 200 })
  labelEs: string;

  @Column({ name: 'label_en', type: 'varchar', length: 200, nullable: true })
  labelEn?: string;

  @Column({
    name: 'placeholder_es',
    type: 'varchar',
    length: 200,
    nullable: true,
  })
  placeholderEs?: string;

  @Column({ name: 'is_required', type: 'boolean', default: false })
  isRequired: boolean;

  @Column({ name: 'is_visible', type: 'boolean', default: true })
  isVisible: boolean;

  @Column({
    name: 'catalog_domain',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  catalogDomain?: string;

  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder: number;

  @Column({ name: 'validation_hints', type: 'jsonb', default: {} })
  validationHints: Record<string, unknown>;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
