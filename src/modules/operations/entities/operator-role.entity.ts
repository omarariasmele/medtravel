import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

@Entity({ schema: 'operations', name: 'operator_roles' })
@Index(['tenantId', 'code'], { unique: true })
export class OperatorRoleEntity extends UuidBaseEntity {
  /** NULL = rol global. FK a core.tenants. */
  @Column({ name: 'tenant_id', type: 'uuid', nullable: true })
  tenantId?: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ name: 'name_es', type: 'varchar', length: 100 })
  nameEs: string;

  @Column({ name: 'name_en', type: 'varchar', length: 100, nullable: true })
  nameEn?: string;

  @Column({ name: 'description_es', type: 'text', nullable: true })
  descriptionEs?: string;

  @Column({ type: 'smallint', default: 1 })
  level: number;

  @Column({ name: 'parent_role_id', type: 'uuid', nullable: true })
  parentRoleId?: string;

  @ManyToOne(() => OperatorRoleEntity)
  @JoinColumn({ name: 'parent_role_id' })
  parentRole?: OperatorRoleEntity;

  @Column({ name: 'max_concurrent_cases', type: 'smallint', default: 3 })
  maxConcurrentCases: number;

  @Column({ name: 'can_create_cases', type: 'boolean', default: false })
  canCreateCases: boolean;

  @Column({ name: 'can_close_cases', type: 'boolean', default: false })
  canCloseCases: boolean;

  @Column({ name: 'can_escalate_cases', type: 'boolean', default: false })
  canEscalateCases: boolean;

  @Column({ name: 'can_authorize_expenses', type: 'boolean', default: false })
  canAuthorizeExpenses: boolean;

  @Column({ name: 'can_access_medical', type: 'boolean', default: false })
  canAccessMedical: boolean;

  @Column({ name: 'can_manage_operators', type: 'boolean', default: false })
  canManageOperators: boolean;

  @Column({ name: 'can_view_reports', type: 'boolean', default: false })
  canViewReports: boolean;

  @Column({ name: 'can_manage_config', type: 'boolean', default: false })
  canManageConfig: boolean;

  @Column({ name: 'module_access', type: 'text', array: true, nullable: true })
  moduleAccess?: string[];

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
