import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

export type SuppressionRequesterType =
  'MEMBER' | 'LEGAL' | 'TENANT_ADMIN' | 'REGULATOR';

export type SuppressionScope =
  'FULL_ERASURE' | 'SELECTIVE_ERASURE' | 'ANONYMIZATION' | 'PORTABILITY';

export type SuppressionStatus =
  | 'RECEIVED'
  | 'VALIDATING'
  | 'LEGAL_HOLD_CHECK'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'PARTIALLY_COMPLETED'
  | 'REJECTED'
  | 'WITHDRAWN';

@Entity({ schema: 'audit', name: 'data_suppression_requests' })
export class DataSuppressionRequestEntity extends UuidBaseEntity {
  @Column({ name: 'requester_type', type: 'varchar', length: 20 })
  requesterType: SuppressionRequesterType;

  @Column({ name: 'requester_id', type: 'uuid', nullable: true })
  requesterId?: string;

  @Column({ name: 'requester_name', type: 'text', nullable: true })
  requesterName?: string;

  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  /** FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'varchar', length: 25 })
  scope: SuppressionScope;

  @Column({ type: 'varchar', length: 20 })
  regulation: string;

  @Column({ name: 'legal_basis', type: 'text', nullable: true })
  legalBasis?: string;

  @Column({
    name: 'specific_fields',
    type: 'text',
    array: true,
    nullable: true,
  })
  specificFields?: string[];

  @Column({ type: 'varchar', length: 25, default: 'RECEIVED' })
  status: SuppressionStatus;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  @Column({ name: 'deadline_at', type: 'timestamptz', nullable: true })
  deadlineAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt?: Date;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ name: 'actions_taken', type: 'jsonb', default: [] })
  actionsTaken: unknown[];

  @Column({ name: 'retained_data', type: 'jsonb', default: [] })
  retainedData: unknown[];

  @Column({ name: 'retention_justification', type: 'text', nullable: true })
  retentionJustification?: string;

  @Column({ name: 'confirmation_sent_at', type: 'timestamptz', nullable: true })
  confirmationSentAt?: Date;

  @Column({ name: 'processed_by', type: 'uuid', nullable: true })
  processedBy?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
