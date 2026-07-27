import { Column, Entity } from 'typeorm';

import { UuidBaseEntity } from '@common/database/uuid-base.entity';

/**
 * MTA-511 (cambio #8): configurable por el titular — si los aportes
 * provisionales (aún no confirmados) se muestran en la ficha de emergencia,
 * y si van en un bloque diferenciado con la etiqueta "provisional".
 */
@Entity({ schema: 'clinical', name: 'submission_visibility_policies' })
export class SubmissionVisibilityPolicyEntity extends UuidBaseEntity {
  /** FK a core.members — 1:1 (UNIQUE). */
  @Column({ name: 'member_id', type: 'uuid', unique: true })
  memberId: string;

  @Column({
    name: 'share_provisional_in_emergency',
    type: 'boolean',
    default: true,
  })
  shareProvisionalInEmergency: boolean;

  @Column({ name: 'share_provisional_always', type: 'boolean', default: false })
  shareProvisionalAlways: boolean;

  @Column({ name: 'show_provisional_label', type: 'boolean', default: true })
  showProvisionalLabel: boolean;

  @Column({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
