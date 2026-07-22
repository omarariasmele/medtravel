import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { ClinicalDocumentEntity } from './clinical-document.entity';

/** B9: expires_at siempre NOT NULL — nunca crear un share sin vencimiento. */
@Entity({ schema: 'clinical', name: 'document_shares' })
export class DocumentShareEntity extends UuidBaseEntity {
  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @ManyToOne(() => ClinicalDocumentEntity)
  @JoinColumn({ name: 'document_id' })
  document?: ClinicalDocumentEntity;

  /** FK a core.persons. */
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @Column({ name: 'share_token', type: 'text', unique: true })
  shareToken: string;

  @Column({ name: 'share_url', type: 'text' })
  shareUrl: string;

  @Column({ name: 'shared_with_name', type: 'text', nullable: true })
  sharedWithName?: string;

  @Column({ name: 'shared_with_email', type: 'text', nullable: true })
  sharedWithEmail?: string;

  @Column({ name: 'share_purpose', type: 'text', nullable: true })
  sharePurpose?: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'max_accesses', type: 'smallint', default: 3 })
  maxAccesses: number;

  @Column({ name: 'access_count', type: 'smallint', default: 0 })
  accessCount: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy?: string;

  @Column({ name: 'notify_on_access', type: 'boolean', default: true })
  notifyOnAccess: boolean;

  @Column({ name: 'last_accessed_at', type: 'timestamptz', nullable: true })
  lastAccessedAt?: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
