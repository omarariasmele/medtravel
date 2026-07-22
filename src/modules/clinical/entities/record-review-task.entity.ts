import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { EncounterSubmissionEntity } from './encounter-submission.entity';

/** Tareas de revisión humana sobre encounter_submissions pendientes. */
@Entity({ schema: 'clinical', name: 'record_review_tasks' })
export class RecordReviewTaskEntity extends UuidBaseEntity {
  @Column({ name: 'submission_id', type: 'uuid' })
  submissionId: string;

  @ManyToOne(() => EncounterSubmissionEntity)
  @JoinColumn({ name: 'submission_id' })
  submission?: EncounterSubmissionEntity;

  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'assigned_to', type: 'uuid', nullable: true })
  assignedTo?: string;

  /** FK a params.catalog_values (dominio REVIEW_PRIORITY). */
  @Column({ name: 'priority_id', type: 'uuid' })
  priorityId: string;

  @Column({ name: 'review_deadline', type: 'timestamptz', nullable: true })
  reviewDeadline?: Date;

  /** FK a params.catalog_values (dominio REVIEW_DECISION). */
  @Column({ name: 'decision_id', type: 'uuid', nullable: true })
  decisionId?: string;

  @Column({ name: 'reviewer_notes', type: 'text', nullable: true })
  reviewerNotes?: string;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt?: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
