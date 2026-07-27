import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { PartnerMemberRecordEntity } from './partner-member-record.entity';
import { PersonEntity } from './person.entity';

@Entity({ schema: 'core', name: 'identity_match_candidates' })
export class IdentityMatchCandidateEntity extends UuidBaseEntity {
  @Column({ name: 'partner_record_id', type: 'uuid' })
  partnerRecordId: string;

  @ManyToOne(() => PartnerMemberRecordEntity)
  @JoinColumn({ name: 'partner_record_id' })
  partnerRecord?: PartnerMemberRecordEntity;

  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @ManyToOne(() => PersonEntity)
  @JoinColumn({ name: 'person_id' })
  person?: PersonEntity;

  @Column({ name: 'confidence_score', type: 'numeric', precision: 5, scale: 4 })
  confidenceScore: string;

  /** FK a params.catalog_values (dominio MATCH_TYPE). */
  @Column({ name: 'match_type_id', type: 'uuid' })
  matchTypeId: string;

  @Column({ type: 'jsonb', default: {} })
  evidence: Record<string, unknown>;

  /** FK a params.catalog_values (dominio MATCH_CANDIDATE_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
