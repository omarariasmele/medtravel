import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

export type ProviderLifecycleStatus = 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'RETIRED';

/**
 * Prestador de salud (obra social/prepaga/hospital) — OSDE, Swiss
 * Medical, Hospital Italiano, etc. Tabla propia (no
 * params.domain_catalogs) a pedido explícito del usuario: necesita
 * "país y prestador como campos mínimos", con FK real a país, no un
 * catálogo plano sin ese campo. Sin RLS (catálogo de referencia
 * global) — el alta libre queda abierta a cualquier viajero
 * autenticado a nivel app, aprobar/editar/fusionar quedan detrás de
 * ConfigAccessGuard.
 */
@Entity({ schema: 'coverage', name: 'healthcare_providers' })
export class HealthcareProviderEntity extends UuidBaseEntity {
  /** FK a params.catalog_values (dominio HEALTH_COVERAGE_TYPE) — obra social vs. prepaga, no son lo mismo. */
  @Column({ name: 'provider_type_id', type: 'uuid' })
  providerTypeId: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid' })
  countryId: string;

  /** Código oficial del padrón (ej. RNOS de Argentina) — NULL si no tiene uno. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  code?: string;

  @Column({ type: 'varchar', length: 250 })
  name: string;

  @Column({
    name: 'lifecycle_status',
    type: 'varchar',
    length: 20,
    default: 'ACTIVE',
  })
  lifecycleStatus: ProviderLifecycleStatus;

  /** NULL si lo sembró el admin/seed — solo se completa si lo carga un viajero. */
  @Column({ name: 'submitted_by_person_id', type: 'uuid', nullable: true })
  submittedByPersonId?: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  /** Si un operador lo fusionó como duplicado de un prestador ya existente. */
  @Column({ name: 'merged_into_id', type: 'uuid', nullable: true })
  mergedIntoId?: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
