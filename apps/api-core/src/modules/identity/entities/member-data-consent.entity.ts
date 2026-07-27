import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { MemberEntity } from './member.entity';
import { TenantEntity } from './tenant.entity';

/**
 * Leída por clinical.has_clinical_access() (000_extensions.sql) para el
 * caso 4 (consentimiento activo del titular) — granted=TRUE y
 * purpose.code IN ('EMERGENCY_CLINICAL_ACCESS','FULL_CLINICAL_ACCESS').
 */
@Entity({ schema: 'core', name: 'member_data_consents' })
export class MemberDataConsentEntity extends UuidBaseEntity {
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @ManyToOne(() => MemberEntity)
  @JoinColumn({ name: 'member_id' })
  member?: MemberEntity;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => TenantEntity)
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  /** FK a params.consent_purposes. */
  @Column({ name: 'purpose_id', type: 'uuid' })
  purposeId: string;

  @Column({ type: 'boolean' })
  granted: boolean;

  @Column({ name: 'granted_at', type: 'timestamptz' })
  grantedAt: Date;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil?: Date;

  @Column({ name: 'consent_text_version', type: 'varchar', length: 20 })
  consentTextVersion: string;

  @Column({ name: 'withdrawal_at', type: 'timestamptz', nullable: true })
  withdrawalAt?: Date;

  @Column({ name: 'withdrawal_reason', type: 'text', nullable: true })
  withdrawalReason?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
