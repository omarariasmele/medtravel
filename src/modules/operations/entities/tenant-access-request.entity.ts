import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { OperatorEntity } from './operator.entity';

/**
 * MTA-511 (cambio #3): eliminado REQUIRES_SUPERADMIN_APPROVAL —
 * approved_by_type_id solo admite USER_CONFIRMED o SYSTEM_ACTIVE_ON_CASE.
 */
@Entity({ schema: 'operations', name: 'tenant_access_requests' })
export class TenantAccessRequestEntity extends UuidBaseEntity {
  /** FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @Column({ name: 'requested_by', type: 'uuid' })
  requestedBy: string;

  @ManyToOne(() => OperatorEntity)
  @JoinColumn({ name: 'requested_by' })
  requester?: OperatorEntity;

  @Column({ name: 'request_reason', type: 'text' })
  requestReason: string;

  /** FK a params.catalog_values (dominio ACCESS_REQUEST_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  /** FK a params.catalog_values (dominio ACCESS_APPROVAL_TYPE — USER_CONFIRMED | SYSTEM_ACTIVE_ON_CASE). */
  @Column({ name: 'approved_by_type_id', type: 'uuid' })
  approvedByTypeId: string;

  @Column({ name: 'approved_by_id', type: 'uuid', nullable: true })
  approvedById?: string;

  /** FK a params.catalog_values (dominio ACCESS_SCOPE). */
  @Column({ name: 'scope_id', type: 'uuid', nullable: true })
  scopeId?: string;

  @Column({ name: 'case_id', type: 'uuid', nullable: true })
  caseId?: string;

  @Column({ name: 'valid_until', type: 'timestamptz', nullable: true })
  validUntil?: Date;

  @Column({ name: 'notification_sent_at', type: 'timestamptz', nullable: true })
  notificationSentAt?: Date;

  @Column({ name: 'member_response_at', type: 'timestamptz', nullable: true })
  memberResponseAt?: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date;
}
