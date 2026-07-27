import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { ChatMessageEntity } from './chat-message.entity';

@Entity({ schema: 'operations', name: 'chat_translations' })
@Index(['messageId', 'targetLanguage'], { unique: true })
export class ChatTranslationEntity extends UuidBaseEntity {
  @Column({ name: 'message_id', type: 'uuid' })
  messageId: string;

  @ManyToOne(() => ChatMessageEntity)
  @JoinColumn({ name: 'message_id' })
  message?: ChatMessageEntity;

  @Column({ name: 'source_language', type: 'char', length: 5 })
  sourceLanguage: string;

  @Column({ name: 'target_language', type: 'char', length: 5 })
  targetLanguage: string;

  @Column({ name: 'translated_content', type: 'text' })
  translatedContent: string;

  @Column({
    name: 'translation_model',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  translationModel?: string;

  @Column({
    name: 'confidence_score',
    type: 'numeric',
    precision: 4,
    scale: 3,
    nullable: true,
  })
  confidenceScore?: string;

  @Column({ name: 'tokens_used', type: 'int', nullable: true })
  tokensUsed?: number;

  @Column({ name: 'translated_at', type: 'timestamptz' })
  translatedAt: Date;
}
