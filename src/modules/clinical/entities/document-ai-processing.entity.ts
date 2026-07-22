import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { ClinicalDocumentEntity } from './clinical-document.entity';

/** Consumida por la cola BullMQ `document-ai-processing` (ver src/modules/jobs). */
@Entity({ schema: 'clinical', name: 'document_ai_processing' })
export class DocumentAiProcessingEntity extends UuidBaseEntity {
  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @ManyToOne(() => ClinicalDocumentEntity)
  @JoinColumn({ name: 'document_id' })
  document?: ClinicalDocumentEntity;

  /** FK a core.persons. */
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  /** FK a params.catalog_values (dominio AI_AGENT_TYPE). */
  @Column({ name: 'agent_type_id', type: 'uuid' })
  agentTypeId: string;

  @Column({ name: 'agent_model', type: 'varchar', length: 50, nullable: true })
  agentModel?: string;

  /** FK a params.catalog_values (dominio AI_PROCESSING_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'queued_at', type: 'timestamptz' })
  queuedAt: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ name: 'processing_ms', type: 'int', nullable: true })
  processingMs?: number;

  @Column({ name: 'extracted_data', type: 'jsonb', nullable: true })
  extractedData?: Record<string, unknown>;

  @Column({ name: 'extracted_text', type: 'text', nullable: true })
  extractedText?: string;

  @Column({ name: 'summary_es', type: 'text', nullable: true })
  summaryEs?: string;

  @Column({ name: 'summary_en', type: 'text', nullable: true })
  summaryEn?: string;

  @Column({ name: 'ai_observations', type: 'jsonb', nullable: true })
  aiObservations?: Record<string, unknown>;

  @Column({
    name: 'confidence_score',
    type: 'numeric',
    precision: 4,
    scale: 3,
    nullable: true,
  })
  confidenceScore?: string;

  @Column({ name: 'quality_issues', type: 'text', array: true, nullable: true })
  qualityIssues?: string[];

  @Column({ name: 'tokens_input', type: 'int', nullable: true })
  tokensInput?: number;

  @Column({ name: 'tokens_output', type: 'int', nullable: true })
  tokensOutput?: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'retry_count', type: 'smallint', default: 0 })
  retryCount: number;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
