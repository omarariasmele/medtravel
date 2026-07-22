import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { ChatChannelEntity } from './chat-channel.entity';
import { EmergencyCaseEntity } from './emergency-case.entity';

/**
 * RLS (C4, 007_operations.sql): msg_select/msg_insert exigen ser
 * participante activo del canal (case_participants.is_active,
 * can_send_messages para INSERT); msg_no_update/msg_no_delete (USING FALSE)
 * — los mensajes son inmutables, usar is_hidden/hidden_reason para moderar.
 */
@Entity({ schema: 'operations', name: 'chat_messages' })
export class ChatMessageEntity extends UuidBaseEntity {
  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @ManyToOne(() => ChatChannelEntity)
  @JoinColumn({ name: 'channel_id' })
  channel?: ChatChannelEntity;

  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @ManyToOne(() => EmergencyCaseEntity)
  @JoinColumn({ name: 'case_id' })
  case?: EmergencyCaseEntity;

  /** FK a params.catalog_values (dominio CHAT_SENDER_TYPE). */
  @Column({ name: 'sender_type_id', type: 'uuid' })
  senderTypeId: string;

  @Column({ name: 'sender_id', type: 'uuid', nullable: true })
  senderId?: string;

  @Column({ name: 'sender_name', type: 'text' })
  senderName: string;

  @Column({ name: 'sender_company', type: 'text', nullable: true })
  senderCompany?: string;

  /** FK a params.catalog_values (dominio CHAT_MESSAGE_TYPE). */
  @Column({ name: 'message_type_id', type: 'uuid' })
  messageTypeId: string;

  @Column({ type: 'text', nullable: true })
  content?: string;

  @Column({ name: 'content_language', type: 'char', length: 5, nullable: true })
  contentLanguage?: string;

  @Column({ name: 'reply_to_id', type: 'uuid', nullable: true })
  replyToId?: string;

  @Column({ name: 'reply_preview', type: 'text', nullable: true })
  replyPreview?: string;

  @Column({ name: 'has_attachments', type: 'boolean', default: false })
  hasAttachments: boolean;

  @Column({ name: 'attachment_count', type: 'smallint', default: 0 })
  attachmentCount: number;

  @Column({
    name: 'location_lat',
    type: 'numeric',
    precision: 10,
    scale: 8,
    nullable: true,
  })
  locationLat?: string;

  @Column({
    name: 'location_lng',
    type: 'numeric',
    precision: 11,
    scale: 8,
    nullable: true,
  })
  locationLng?: string;

  @Column({ name: 'location_address', type: 'text', nullable: true })
  locationAddress?: string;

  /** FK a params.catalog_values (dominio CHAT_MESSAGE_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden: boolean;

  @Column({ name: 'hidden_at', type: 'timestamptz', nullable: true })
  hiddenAt?: Date;

  @Column({ name: 'hidden_by', type: 'uuid', nullable: true })
  hiddenBy?: string;

  @Column({ name: 'hidden_reason', type: 'text', nullable: true })
  hiddenReason?: string;

  @Column({ name: 'creates_medical_event', type: 'boolean', default: false })
  createsMedicalEvent: boolean;

  /** FK a params.catalog_values (dominio SYSTEM_EVENT_TYPE). */
  @Column({ name: 'system_event_type_id', type: 'uuid', nullable: true })
  systemEventTypeId?: string;

  @Column({ name: 'system_event_data', type: 'jsonb', nullable: true })
  systemEventData?: Record<string, unknown>;

  @Column({ name: 'sent_at', type: 'timestamptz' })
  sentAt: Date;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt?: Date;

  @Column({ name: 'read_by_all_at', type: 'timestamptz', nullable: true })
  readByAllAt?: Date;
}
