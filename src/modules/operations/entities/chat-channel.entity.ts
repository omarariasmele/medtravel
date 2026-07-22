import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { EmergencyCaseEntity } from './emergency-case.entity';

/** Consumido por operations/events.gateway.ts (Socket.io) para las salas por case_id. */
@Entity({ schema: 'operations', name: 'chat_channels' })
export class ChatChannelEntity extends UuidBaseEntity {
  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @ManyToOne(() => EmergencyCaseEntity)
  @JoinColumn({ name: 'case_id' })
  case?: EmergencyCaseEntity;

  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  /** FK a params.catalog_values (dominio CHAT_CHANNEL_TYPE). */
  @Column({ name: 'channel_type_id', type: 'uuid' })
  channelTypeId: string;

  /** FK a params.catalog_values (dominio CHAT_CHANNEL_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'allow_files', type: 'boolean', default: true })
  allowFiles: boolean;

  @Column({ name: 'auto_translate', type: 'boolean', default: true })
  autoTranslate: boolean;

  @Column({ name: 'pinned_message_id', type: 'uuid', nullable: true })
  pinnedMessageId?: string;

  @Column({ name: 'message_count', type: 'int', default: 0 })
  messageCount: number;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt?: Date;

  @Column({ name: 'last_message_preview', type: 'text', nullable: true })
  lastMessagePreview?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
