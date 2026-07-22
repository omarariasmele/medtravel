import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/** Preferencias de qué mostrar en la ficha de emergencia — 1:1 con core.members. */
@Entity({ schema: 'emergency', name: 'profiles' })
export class EmergencyProfileEntity extends UuidBaseEntity {
  @Column({ name: 'member_id', type: 'uuid', unique: true })
  memberId: string;

  @Column({ name: 'show_allergies', type: 'boolean', default: true })
  showAllergies: boolean;

  @Column({ name: 'show_conditions', type: 'boolean', default: true })
  showConditions: boolean;

  @Column({ name: 'show_medications', type: 'boolean', default: true })
  showMedications: boolean;

  @Column({ name: 'show_surgeries', type: 'boolean', default: true })
  showSurgeries: boolean;

  @Column({ name: 'show_vaccines', type: 'boolean', default: false })
  showVaccines: boolean;

  @Column({ name: 'show_morphology', type: 'boolean', default: true })
  showMorphology: boolean;

  @Column({ name: 'show_contacts', type: 'boolean', default: true })
  showContacts: boolean;

  @Column({ name: 'show_insurance', type: 'boolean', default: true })
  showInsurance: boolean;

  @Column({ name: 'show_lab_summary', type: 'boolean', default: false })
  showLabSummary: boolean;

  @Column({ name: 'personal_note_es', type: 'text', nullable: true })
  personalNoteEs?: string;

  @Column({ name: 'personal_note_en', type: 'text', nullable: true })
  personalNoteEn?: string;

  @Column({ name: 'completeness_pct', type: 'smallint', default: 0 })
  completenessPct: number;

  @Column({ name: 'last_reviewed_at', type: 'timestamptz', nullable: true })
  lastReviewedAt?: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
