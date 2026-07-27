import { ResourceRegistryEntry } from '@common/database/create-resource-controller';

import { TenantEntity } from './entities/tenant.entity';
import { TenantAppVariantEntity } from './entities/tenant-app-variant.entity';
import { TenantBrandProfileEntity } from './entities/tenant-brand-profile.entity';
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
 * `persons.first_name/last_name` están encriptados en la base (ver
 * proposed-clinical-encryption.sql) — RlsCrudService los desencripta/
 * encripta automáticamente vía `encryptedFields`.
 */
export const IDENTITY_REGISTRY: Record<string, ResourceRegistryEntry> = {
  tenants: TenantEntity,
  'tenant-app-variants': TenantAppVariantEntity,
  'tenant-brand-profiles': TenantBrandProfileEntity,
  persons: { entity: PersonEntity, encryptedFields: ['firstName', 'lastName'] },
  members: MemberEntity,
  'member-contacts': MemberContactEntity,
  'member-data-consents': MemberDataConsentEntity,
};
