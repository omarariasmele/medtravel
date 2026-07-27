import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { ChatMessageEntity } from './chat-message.entity';
import { ChatChannelEntity } from './chat-channel.entity';

@Entity({ schema: 'operations', name: 'message_attachments' })
export class MessageAttachmentEntity extends UuidBaseEntity {
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

  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @Column({ name: 'file_name_original', type: 'text' })
  fileNameOriginal: string;

  @Column({ name: 'file_name_storage', type: 'text' })
  fileNameStorage: string;

  @Column({ name: 'file_extension', type: 'varchar', length: 10 })
  fileExtension: string;

  @Column({ name: 'file_size_bytes', type: 'int' })
  fileSizeBytes: number;

  @Column({ name: 'file_hash_sha256', type: 'text' })
  fileHashSha256: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  @Column({ name: 'storage_path', type: 'text' })
  storagePath: string;

  @Column({ name: 'is_encrypted', type: 'boolean', default: true })
  isEncrypted: boolean;

  /** FK a params.catalog_values (dominio DOCUMENT_TYPE). */
  @Column({ name: 'document_type_id', type: 'uuid', nullable: true })
  documentTypeId?: string;

  @Column({ name: 'saved_to_history', type: 'boolean', default: false })
  savedToHistory: boolean;

  /** FK a clinical.documents, si se guardó en el historial. */
  @Column({ name: 'clinical_doc_id', type: 'uuid', nullable: true })
  clinicalDocId?: string;

  @Column({ name: 'saved_at', type: 'timestamptz', nullable: true })
  savedAt?: Date;

  @Column({ name: 'thumbnail_url', type: 'text', nullable: true })
  thumbnailUrl?: string;

  @Column({ name: 'duration_seconds', type: 'smallint', nullable: true })
  durationSeconds?: number;

  /** FK a params.catalog_values (dominio ATTACHMENT_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt: Date;
}
