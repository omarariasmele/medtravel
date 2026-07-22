import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { OrganizationCandidateEntity } from './organization-candidate.entity';
import { HealthcareOrganizationEntity } from './healthcare-organization.entity';

@Entity({ schema: 'clinical', name: 'organization_match_decisions' })
export class OrganizationMatchDecisionEntity extends UuidBaseEntity {
  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => OrganizationCandidateEntity)
  @JoinColumn({ name: 'candidate_id' })
  candidate?: OrganizationCandidateEntity;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string;

  @ManyToOne(() => HealthcareOrganizationEntity)
  @JoinColumn({ name: 'organization_id' })
  organization?: HealthcareOrganizationEntity;

  /** FK a params.catalog_values (dominio ORG_MATCH_DECISION_TYPE). */
  @Column({ name: 'decision_type_id', type: 'uuid' })
  decisionTypeId: string;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy?: string;

  @Column({ name: 'auto_resolved', type: 'boolean', default: false })
  autoResolved: boolean;

  @Column({
    name: 'confidence_at_decision',
    type: 'numeric',
    precision: 5,
    scale: 4,
    nullable: true,
  })
  confidenceAtDecision?: string;

  @Column({ name: 'decision_notes', type: 'text', nullable: true })
  decisionNotes?: string;

  @Column({ name: 'can_undo', type: 'boolean', default: true })
  canUndo: boolean;

  @Column({ name: 'undone_at', type: 'timestamptz', nullable: true })
  undoneAt?: Date;

  @Column({ name: 'undone_by', type: 'uuid', nullable: true })
  undoneBy?: string;

  @Column({ name: 'decided_at', type: 'timestamptz' })
  decidedAt: Date;
}
