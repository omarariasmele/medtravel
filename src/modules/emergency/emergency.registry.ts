import { EntityTarget, ObjectLiteral } from 'typeorm';

import { EmergencyProfileEntity } from './entities/emergency-profile.entity';
import { EmergencyTokenEntity } from './entities/emergency-token.entity';
import { SignedOfflineAccessEntity } from './entities/signed-offline-access.entity';

/** Excluidos a propósito: access-log y token-usage-log (logs inmutables). */
export const EMERGENCY_REGISTRY: Record<string, EntityTarget<ObjectLiteral>> = {
  profiles: EmergencyProfileEntity,
  tokens: EmergencyTokenEntity,
  'signed-offline-access': SignedOfflineAccessEntity,
};
