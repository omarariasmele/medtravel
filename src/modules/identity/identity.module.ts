import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TenantEntity } from './entities/tenant.entity';
import { TenantAppVariantEntity } from './entities/tenant-app-variant.entity';
import { TenantBrandProfileEntity } from './entities/tenant-brand-profile.entity';
import { PersonEntity } from './entities/person.entity';
import { ExternalIdentifierEntity } from './entities/external-identifier.entity';
import { UserEntity } from './entities/user.entity';
import { AuthenticationCredentialEntity } from './entities/authentication-credential.entity';
import { PasswordResetTokenEntity } from './entities/password-reset-token.entity';
import { MfaMethodEntity } from './entities/mfa-method.entity';
import { SecuritySessionEntity } from './entities/security-session.entity';
import { MemberEntity } from './entities/member.entity';
import { PartnerMemberRecordEntity } from './entities/partner-member-record.entity';
import { IdentityMatchCandidateEntity } from './entities/identity-match-candidate.entity';
import { IdentityMatchDecisionEntity } from './entities/identity-match-decision.entity';
import { MemberDataConsentEntity } from './entities/member-data-consent.entity';
import { MemberContactEntity } from './entities/member-contact.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      TenantEntity,
      TenantAppVariantEntity,
      TenantBrandProfileEntity,
      PersonEntity,
      ExternalIdentifierEntity,
      UserEntity,
      AuthenticationCredentialEntity,
      PasswordResetTokenEntity,
      MfaMethodEntity,
      SecuritySessionEntity,
      MemberEntity,
      PartnerMemberRecordEntity,
      IdentityMatchCandidateEntity,
      IdentityMatchDecisionEntity,
      MemberDataConsentEntity,
      MemberContactEntity,
    ]),
  ],
  exports: [TypeOrmModule],
})
export class IdentityModule {}
