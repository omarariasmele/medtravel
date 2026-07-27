import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { PersonEntity } from './person.entity';
import { TenantEntity } from './tenant.entity';

/** RLS: members_tenant_or_self — tenant ve sus members; person ve los suyos. */
@Entity({ schema: 'core', name: 'members' })
@Index(['personId', 'tenantId'], { unique: true })
export class MemberEntity extends UuidBaseEntity {
  @Column({ name: 'person_id', type: 'uuid' })
  personId: string;

  @ManyToOne(() => PersonEntity)
  @JoinColumn({ name: 'person_id' })
  person?: PersonEntity;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => TenantEntity)
  @JoinColumn({ name: 'tenant_id' })
  tenant?: TenantEntity;

  @Column({
    name: 'tenant_member_number',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  tenantMemberNumber?: string;

  /** FK a params.catalog_values (dominio MEMBER_STATUS). */
  @Column({ name: 'status_id', type: 'uuid' })
  statusId: string;

  @Column({ name: 'onboarding_completed', type: 'boolean', default: false })
  onboardingCompleted: boolean;

  @Column({ name: 'history_completeness_pct', type: 'smallint', default: 0 })
  historyCompletenessPct: number;

  @Column({ name: 'enrollment_date', type: 'date', nullable: true })
  enrollmentDate?: string;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
