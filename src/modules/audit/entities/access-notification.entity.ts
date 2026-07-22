import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * C8: fila insertada automáticamente por el trigger
 * audit.log_break_glass_access() al crearse un break-glass grant — no crear
 * un endpoint de escritura para esto en el módulo audit, solo lectura/marcado
 * de leído. Consumida también por la cola BullMQ `access-notifications`
 * para el fan-out real de push/email/sms.
 */
@Entity({ schema: 'audit', name: 'access_notifications' })
export class AccessNotificationEntity extends UuidBaseEntity {
  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  /** FK a params.catalog_values (dominio NOTIFICATION_TYPE). */
  @Column({ name: 'notification_type', type: 'uuid' })
  notificationType: string;

  @Column({ name: 'title_es', type: 'text' })
  titleEs: string;

  @Column({ name: 'title_en', type: 'text', nullable: true })
  titleEn?: string;

  @Column({ name: 'body_es', type: 'text' })
  bodyEs: string;

  @Column({ name: 'body_en', type: 'text', nullable: true })
  bodyEn?: string;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @Column({ name: 'send_push', type: 'boolean', default: true })
  sendPush: boolean;

  @Column({ name: 'send_email', type: 'boolean', default: false })
  sendEmail: boolean;

  @Column({ name: 'send_sms', type: 'boolean', default: false })
  sendSms: boolean;

  @Column({ name: 'pushed_at', type: 'timestamptz', nullable: true })
  pushedAt?: Date;

  @Column({ name: 'emailed_at', type: 'timestamptz', nullable: true })
  emailedAt?: Date;

  @Column({ name: 'smsed_at', type: 'timestamptz', nullable: true })
  smsedAt?: Date;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt?: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
