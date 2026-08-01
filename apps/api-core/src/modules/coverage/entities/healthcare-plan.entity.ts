import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

export type PlanLifecycleStatus = 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'RETIRED';

/**
 * Nivel "plan" anidado bajo un prestador (coverage.healthcare_providers)
 * — ej. OSDE 210, Swiss Medical SMG 30. Sin RLS (catálogo de
 * referencia global) — el alta libre queda abierta a cualquier
 * viajero autenticado a nivel app, aprobar/editar/fusionar quedan
 * detrás de ConfigAccessGuard.
 */
@Entity({ schema: 'coverage', name: 'healthcare_plans' })
export class HealthcarePlanEntity extends UuidBaseEntity {
  /** FK a coverage.healthcare_providers. */
  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({
    name: 'lifecycle_status',
    type: 'varchar',
    length: 20,
    default: 'ACTIVE',
  })
  lifecycleStatus: PlanLifecycleStatus;

  /** NULL si lo sembró el admin/seed — solo se completa si lo carga un viajero. */
  @Column({ name: 'submitted_by_person_id', type: 'uuid', nullable: true })
  submittedByPersonId?: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  /** Si un operador lo fusionó como duplicado de un plan ya existente. */
  @Column({ name: 'merged_into_id', type: 'uuid', nullable: true })
  mergedIntoId?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
