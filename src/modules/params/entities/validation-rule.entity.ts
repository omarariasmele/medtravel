import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { FieldDefinitionEntity } from './field-definition.entity';

@Entity({ schema: 'params', name: 'validation_rules' })
export class ValidationRuleEntity extends UuidBaseEntity {
  @Column({ name: 'field_id', type: 'uuid' })
  fieldId: string;

  @ManyToOne(() => FieldDefinitionEntity)
  @JoinColumn({ name: 'field_id' })
  field?: FieldDefinitionEntity;

  @Column({ name: 'rule_type', type: 'varchar', length: 30 })
  ruleType: string;

  @Column({ name: 'rule_value', type: 'jsonb' })
  ruleValue: unknown;

  @Column({
    name: 'error_message_es',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  errorMessageEs?: string;

  @Column({
    name: 'error_message_en',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  errorMessageEn?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
