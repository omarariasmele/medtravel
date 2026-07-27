import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { EmergencyCaseEntity } from './emergency-case.entity';

/** Los flags can_send_messages / can_send_files gobiernan las políticas RLS de chat_messages. */
@Entity({ schema: 'operations', name: 'case_participants' })
export class CaseParticipantEntity extends UuidBaseEntity {
  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @ManyToOne(() => EmergencyCaseEntity)
  @JoinColumn({ name: 'case_id' })
  case?: EmergencyCaseEntity;

  /** FK a params.catalog_values (dominio CASE_PARTICIPANT_TYPE). */
  @Column({ name: 'participant_type_id', type: 'uuid' })
  participantTypeId: string;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  /** FK a operations.operators. */
  @Column({ name: 'operator_id', type: 'uuid', nullable: true })
  operatorId?: string;

  @Column({ name: 'external_name', type: 'text', nullable: true })
  externalName?: string;

  @Column({ name: 'external_email', type: 'text', nullable: true })
  externalEmail?: string;

  @Column({ name: 'display_name', type: 'text' })
  displayName: string;

  @Column({ name: 'can_send_messages', type: 'boolean', default: true })
  canSendMessages: boolean;

  @Column({ name: 'can_send_files', type: 'boolean', default: true })
  canSendFiles: boolean;

  @Column({ name: 'can_close_case', type: 'boolean', default: false })
  canCloseCase: boolean;

  @Column({ name: 'can_authorize_expenses', type: 'boolean', default: false })
  canAuthorizeExpenses: boolean;

  @Column({ name: 'can_view_medical', type: 'boolean', default: true })
  canViewMedical: boolean;

  @Column({ name: 'joined_at', type: 'timestamptz' })
  joinedAt: Date;

  @Column({ name: 'left_at', type: 'timestamptz', nullable: true })
  leftAt?: Date;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'last_seen_at', type: 'timestamptz', nullable: true })
  lastSeenAt?: Date;

  @Column({ name: 'notification_sent', type: 'boolean', default: false })
  notificationSent: boolean;

  @Column({ name: 'notified_at', type: 'timestamptz', nullable: true })
  notifiedAt?: Date;
}
