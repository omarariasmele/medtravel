import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { AssistancePlanEntity } from './assistance-plan.entity';

export type CoverageScope = 'FULL' | 'PARTIAL' | 'EXCLUDED' | 'CONDITIONAL';

/** B8: sin limit_amount ni currency — solo indicadores cualitativos. */
@Entity({ schema: 'coverage', name: 'plan_coverages' })
export class PlanCoverageEntity extends UuidBaseEntity {
  @Column({ name: 'plan_id', type: 'uuid' })
  planId: string;

  @ManyToOne(() => AssistancePlanEntity)
  @JoinColumn({ name: 'plan_id' })
  plan?: AssistancePlanEntity;

  /** FK a params.catalog_values (dominio COVERAGE_CATEGORY). */
  @Column({ name: 'category_id', type: 'uuid' })
  categoryId: string;

  @Column({ name: 'name_es', type: 'varchar', length: 200 })
  nameEs: string;

  @Column({ name: 'name_en', type: 'varchar', length: 200, nullable: true })
  nameEn?: string;

  @Column({ name: 'description_es', type: 'text' })
  descriptionEs: string;

  @Column({ name: 'description_en', type: 'text', nullable: true })
  descriptionEn?: string;

  @Column({
    name: 'coverage_scope',
    type: 'varchar',
    length: 20,
    default: 'FULL',
  })
  coverageScope: CoverageScope;

  @Column({ name: 'requires_auth', type: 'boolean', default: false })
  requiresAuth: boolean;

  @Column({ name: 'notes_es', type: 'text', nullable: true })
  notesEs?: string;

  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
