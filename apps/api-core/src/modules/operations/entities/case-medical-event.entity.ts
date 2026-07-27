import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { EmergencyCaseEntity } from './emergency-case.entity';

/** B2: sin expense_amount/expense_currency — los importes van en el sistema del partner. */
@Entity({ schema: 'operations', name: 'case_medical_events' })
export class CaseMedicalEventEntity extends UuidBaseEntity {
  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @ManyToOne(() => EmergencyCaseEntity)
  @JoinColumn({ name: 'case_id' })
  case?: EmergencyCaseEntity;

  /** FK a core.members. */
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  /** FK a params.catalog_values (dominio MEDICAL_EVENT_TYPE). */
  @Column({ name: 'event_type_id', type: 'uuid' })
  eventTypeId: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ name: 'performed_by', type: 'text', nullable: true })
  performedBy?: string;

  @Column({ name: 'institution_name', type: 'text', nullable: true })
  institutionName?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'country_id', type: 'uuid', nullable: true })
  countryId?: string;

  /** FK a clinical.documents (comprobante). */
  @Column({ name: 'expense_doc_id', type: 'uuid', nullable: true })
  expenseDocId?: string;

  @Column({ name: 'vitals_snapshot', type: 'jsonb', nullable: true })
  vitalsSnapshot?: Record<string, unknown>;

  @Column({ name: 'medication_given', type: 'text', nullable: true })
  medicationGiven?: string;

  @Column({ name: 'creates_clinical_record', type: 'boolean', default: false })
  createsClinicalRecord: boolean;

  @Column({ name: 'registered_by_id', type: 'uuid', nullable: true })
  registeredById?: string;

  @Column({ name: 'event_at', type: 'timestamptz' })
  eventAt: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
