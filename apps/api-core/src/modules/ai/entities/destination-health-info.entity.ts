import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

export type DestinationHealthInfoSource = 'manual' | 'ai_web_search';

/**
 * Contenido de referencia (no dato de un viajero puntual) para el
 * botón "Info del destino" del viaje — pedido explícito del usuario.
 * Mix pedido: fila cargada a mano (source='manual') o refrescada por
 * la IA con búsqueda web (source='ai_web_search', ver
 * AIService.refreshDestinationHealthInfo) cuando falta el país o está
 * desactualizada.
 */
@Entity({ schema: 'ai', name: 'destination_health_info' })
export class DestinationHealthInfoEntity extends UuidBaseEntity {
  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid', unique: true })
  countryId: string;

  @Column({ type: 'text', nullable: true })
  vaccinations?: string;

  @Column({ name: 'health_risks', type: 'text', nullable: true })
  healthRisks?: string;

  @Column({ name: 'security_alerts', type: 'text', nullable: true })
  securityAlerts?: string;

  @Column({ name: 'general_tips', type: 'text', nullable: true })
  generalTips?: string;

  @Column({ type: 'varchar', length: 20, default: 'manual' })
  source: DestinationHealthInfoSource;

  @Column({ name: 'source_notes', type: 'text', nullable: true })
  sourceNotes?: string;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
