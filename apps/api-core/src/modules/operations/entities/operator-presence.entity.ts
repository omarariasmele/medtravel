import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Consumida por operations/events.gateway.ts (Socket.io) para presencia en
 * tiempo real. PK es operator_id (no id UUID genérico) — actualizada por
 * heartbeat cada ~30s (is_online), no vía polling con índice temporal.
 */
@Entity({ schema: 'operations', name: 'operator_presence' })
export class OperatorPresenceEntity {
  @PrimaryColumn({ name: 'operator_id', type: 'uuid' })
  operatorId: string;

  /** FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  /** FK a params.catalog_values (dominio OPERATOR_TYPE). */
  @Column({ name: 'operator_type_id', type: 'uuid', nullable: true })
  operatorTypeId?: string;

  /** FK a params.catalog_values (dominio OPERATOR_PRESENCE_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'active_cases_count', type: 'smallint', default: 0 })
  activeCasesCount: number;

  @Column({ name: 'max_cases', type: 'smallint', default: 3 })
  maxCases: number;

  @Column({ type: 'text', array: true, nullable: true })
  languages?: string[];

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  @Column({ name: 'status_updated_at', type: 'timestamptz' })
  statusUpdatedAt: Date;

  @Column({ name: 'is_online', type: 'boolean', default: false })
  isOnline: boolean;
}
