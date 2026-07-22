import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { ChatMessageEntity } from './chat-message.entity';
import { ChatChannelEntity } from './chat-channel.entity';

@Entity({ schema: 'operations', name: 'message_reads' })
@Index(['messageId', 'readerId'], { unique: true })
export class MessageReadEntity extends UuidBaseEntity {
  @Column({ name: 'message_id', type: 'uuid' })
  messageId: string;

  @ManyToOne(() => ChatMessageEntity)
  @JoinColumn({ name: 'message_id' })
  message?: ChatMessageEntity;

  @Column({ name: 'channel_id', type: 'uuid' })
  channelId: string;

  @ManyToOne(() => ChatChannelEntity)
  @JoinColumn({ name: 'channel_id' })
  channel?: ChatChannelEntity;

  /** FK a params.catalog_values (dominio CHAT_SENDER_TYPE). */
  @Column({ name: 'reader_type_id', type: 'uuid' })
  readerTypeId: string;

  @Column({ name: 'reader_id', type: 'uuid' })
  readerId: string;

  @Column({ name: 'read_at', type: 'timestamptz' })
  readAt: Date;
}
