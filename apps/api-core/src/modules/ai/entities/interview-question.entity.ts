import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

export type InterviewProposalType =
  | 'MEDICATION'
  | 'ALLERGY'
  | 'CONDITION'
  | 'SURGERY'
  | 'IMPLANT_DEVICE';

/**
 * Guion del modelo Estructurado (segundo modelo de carga de Ficha de
 * Salud, pedido explícito del usuario para comparar en una demo contra
 * el modelo Clásico conversacional — ver AIService.structuredIntakeChat()).
 * Nunca se borra una fila (se desactiva) — mismo criterio de retención
 * que el resto del sistema.
 */
@Entity({ schema: 'ai', name: 'interview_questions' })
export class InterviewQuestionEntity extends UuidBaseEntity {
  @Column({ type: 'text', unique: true })
  code: string;

  @Column({ name: 'group_label', type: 'text' })
  groupLabel: string;

  @Column({ name: 'question_text', type: 'text' })
  questionText: string;

  @Column({ name: 'free_text_enabled', type: 'boolean', default: true })
  freeTextEnabled: boolean;

  @Column({ type: 'text', array: true, nullable: true })
  options?: string[];

  @Column({ name: 'asks_date', type: 'boolean', default: true })
  asksDate: boolean;

  @Column({ name: 'proposal_type', type: 'varchar', length: 30 })
  proposalType: InterviewProposalType;

  @Column({ name: 'catalog_domain_code', type: 'text', nullable: true })
  catalogDomainCode?: string;

  /**
   * Etiqueta limpia a usar como nombre de la enfermedad (ej. "Gota")
   * cuando el viajero confirma la pregunta SIN agregar ningún detalle
   * propio — bug real reportado en vivo: sin esto, quedaba guardado el
   * texto de la pregunta tal cual ("¿Padece de gota?") como si fuera el
   * nombre del antecedente. Solo aplica a proposalType CONDITION.
   */
  @Column({ name: 'condition_label', type: 'text', nullable: true })
  conditionLabel?: string;

  @Column({ name: 'display_order', type: 'smallint', default: 0 })
  displayOrder: number;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
