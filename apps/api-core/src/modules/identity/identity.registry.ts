import { ResourceRegistryEntry } from '@common/database/create-resource-controller';

import { TenantEntity } from './entities/tenant.entity';
import { TenantAppVariantEntity } from './entities/tenant-app-variant.entity';
import { PersonEntity } from './entities/person.entity';
import { MemberEntity } from './entities/member.entity';
import { MemberContactEntity } from './entities/member-contact.entity';
import { MemberDataConsentEntity } from './entities/member-data-consent.entity';

/**
 * Excluidos a propósito: users/authentication-credentials/mfa-methods/
 * security-sessions/external-identifiers (campos cifrados + blind-index,
 * los maneja AuthService — un CRUD genérico rompería el índice ciego) y
 * partner-member-records/identity-match-* (pipeline de importación batch).
 *
 * tenant-brand-profiles se movió a PARAMS_REGISTRY (Fase 1): es
 * configuración de marca por tenant, no un dato de identidad, y acá
 * solo tenía AuthGuard('jwt') sin ConfigAccessGuard — cualquier
 * operador autenticado podía reescribir el logo de otra empresa.
 *
 * `persons.first_name/last_name` están encriptados en la base (ver
 * proposed-clinical-encryption.sql) — RlsCrudService los desencripta/
 * encripta automáticamente vía `encryptedFields`.
 */
export const IDENTITY_REGISTRY: Record<string, ResourceRegistryEntry> = {
  tenants: TenantEntity,
  'tenant-app-variants': TenantAppVariantEntity,
  persons: { entity: PersonEntity, encryptedFields: ['firstName', 'lastName'] },
  members: MemberEntity,
  'member-contacts': { entity: MemberContactEntity, encryptedFields: ['phone'] },
  'member-data-consents': MemberDataConsentEntity,
};
