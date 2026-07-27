import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * C3: app_runtime NO tiene INSERT directo en esta tabla (revocado en
 * 001_audit.sql) — un grant solo se crea vía audit.request_break_glass()
 * SECURITY DEFINER. No agregar un método `create` en el repositorio de este
 * módulo: usar BreakGlassService, que llama a las funciones controladas.
 */
@Entity({ schema: 'audit', name: 'break_glass_grants' })
export class BreakGlassGrantEntity extends UuidBaseEntity {
  /** FK a core.users. */
  @Column({ name: 'granted_to', type: 'uuid' })
  grantedTo: string;

  /** FK a core.users. */
  @Column({ name: 'granted_by', type: 'uuid' })
  grantedBy: string;

  /** FK a core.persons. */
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  /** FK a params.catalog_values (dominio BG_PURPOSE). */
  @Column({ name: 'purpose_id', type: 'uuid' })
  purposeId: string;

  /** FK a params.catalog_values (dominio BG_LEGAL_BASIS). */
  @Column({ name: 'legal_basis_id', type: 'uuid' })
  legalBasisId: string;

  @Column({ type: 'text' })
  justification: string;

  @Column({ name: 'valid_from', type: 'timestamptz' })
  validFrom: Date;

  @Column({ name: 'valid_until', type: 'timestamptz' })
  validUntil: Date;

  /** FK a core.users. */
  @Column({ name: 'second_approver', type: 'uuid', nullable: true })
  secondApprover?: string;

  @Column({ name: 'second_approved_at', type: 'timestamptz', nullable: true })
  secondApprovedAt?: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  /** FK a core.users. */
  @Column({ name: 'revoked_by', type: 'uuid', nullable: true })
  revokedBy?: string;

  @Column({ name: 'revoke_reason', type: 'text', nullable: true })
  revokeReason?: string;

  @Column({ name: 'titular_notified_at', type: 'timestamptz', nullable: true })
  titularNotifiedAt?: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
