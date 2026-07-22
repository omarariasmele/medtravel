import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

import { UserEntity } from './user.entity';

@Entity({ schema: 'core', name: 'mfa_methods' })
export class MfaMethodEntity extends UuidBaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @ManyToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  /** FK a params.catalog_values (dominio MFA_METHOD_TYPE). */
  @Column({ name: 'method_type_id', type: 'uuid' })
  methodTypeId: string;

  /** Cifrado (secreto TOTP, etc.) vía core.encrypt_pii. */
  @Column({ name: 'method_value', type: 'bytea', nullable: true })
  methodValue?: Buffer;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt?: Date;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
