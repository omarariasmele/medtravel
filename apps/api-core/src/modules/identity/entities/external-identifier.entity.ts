import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { PersonEntity } from './person.entity';

/**
 * B6: doc_number va cifrado (core.encrypt_pii) — nunca leer/escribir en
 * texto plano desde este entity. doc_number_idx es el blind index
 * (core.blind_index) usado para búsqueda y unicidad; el servicio de este
 * módulo es responsable de calcularlo vía la función SQL, no en JS.
 */
@Entity({ schema: 'core', name: 'external_identifiers' })
@Index(['docTypeId', 'issuingCountryId', 'docNumberIdx'], { unique: true })
export class ExternalIdentifierEntity extends UuidBaseEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @ManyToOne(() => PersonEntity)
  @JoinColumn({ name: 'person_id' })
  person?: PersonEntity;

  /** FK a params.catalog_values (dominio DOC_TYPE). */
  @Column({ name: 'doc_type_id', type: 'uuid' })
  docTypeId: string;

  @Column({ name: 'doc_number', type: 'bytea' })
  docNumber: Buffer;

  @Column({ name: 'doc_number_idx', type: 'text' })
  docNumberIdx: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'issuing_country_id', type: 'uuid', nullable: true })
  issuingCountryId?: string;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate?: string;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
