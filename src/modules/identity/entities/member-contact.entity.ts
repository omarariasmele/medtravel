import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { MemberEntity } from './member.entity';

@Entity({ schema: 'core', name: 'member_contacts' })
export class MemberContactEntity extends UuidBaseEntity {
  @Column({ name: 'member_id', type: 'uuid' })
  memberId: string;

  @ManyToOne(() => MemberEntity)
  @JoinColumn({ name: 'member_id' })
  member?: MemberEntity;

  @Column({ name: 'linked_member_id', type: 'uuid', nullable: true })
  linkedMemberId?: string;

  @ManyToOne(() => MemberEntity)
  @JoinColumn({ name: 'linked_member_id' })
  linkedMember?: MemberEntity;

  @Column({ name: 'first_name', type: 'text' })
  firstName: string;

  @Column({ name: 'last_name', type: 'text' })
  lastName: string;

  /** FK a params.catalog_values (dominio RELATIONSHIP_TYPE). */
  @Column({ name: 'relationship_type_id', type: 'uuid' })
  relationshipTypeId: string;

  @Column({ type: 'bytea', nullable: true })
  email?: Buffer;

  @Column({ name: 'email_blind_index', type: 'text', nullable: true })
  emailBlindIndex?: string;

  @Column({ type: 'bytea', nullable: true })
  phone?: Buffer;

  @Column({ name: 'phone_blind_index', type: 'text', nullable: true })
  phoneBlindIndex?: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @Column({ name: 'phone_country_id', type: 'uuid', nullable: true })
  phoneCountryId?: string;

  @Column({ name: 'is_emergency_contact', type: 'boolean', default: true })
  isEmergencyContact: boolean;

  @Column({ name: 'is_travel_companion', type: 'boolean', default: false })
  isTravelCompanion: boolean;

  @Column({ name: 'contact_priority', type: 'smallint', default: 1 })
  contactPriority: number;

  @Column({ name: 'can_view_medical', type: 'boolean', default: false })
  canViewMedical: boolean;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
