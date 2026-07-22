import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { IdentityMatchCandidateEntity } from './identity-match-candidate.entity';
import { MemberEntity } from './member.entity';

@Entity({ schema: 'core', name: 'identity_match_decisions' })
export class IdentityMatchDecisionEntity extends UuidBaseEntity {
  @Column({ name: 'candidate_id', type: 'uuid' })
  candidateId: string;

  @ManyToOne(() => IdentityMatchCandidateEntity)
  @JoinColumn({ name: 'candidate_id' })
  candidate?: IdentityMatchCandidateEntity;

  @Column({ name: 'member_id', type: 'uuid', nullable: true })
  memberId?: string;

  @ManyToOne(() => MemberEntity)
  @JoinColumn({ name: 'member_id' })
  member?: MemberEntity;

  /** FK a params.catalog_values (dominio MATCH_DECISION). */
  @Column({ name: 'decision_id', type: 'uuid' })
  decisionId: string;

  @Column({ name: 'decided_by', type: 'uuid', nullable: true })
  decidedBy?: string;

  @Column({ name: 'auto_resolved', type: 'boolean', default: false })
  autoResolved: boolean;

  @Column({ name: 'decision_notes', type: 'text', nullable: true })
  decisionNotes?: string;

  @Column({ name: 'decided_at', type: 'timestamptz' })
  decidedAt: Date;
}
