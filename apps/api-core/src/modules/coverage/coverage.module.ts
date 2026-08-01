import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AssistancePlanEntity } from './entities/assistance-plan.entity';
import { PlanCoverageEntity } from './entities/plan-coverage.entity';
import { CoverageSponsorEntity } from './entities/coverage-sponsor.entity';
import { CardNetworkEntity } from './entities/card-network.entity';
import { CardIssuerEntity } from './entities/card-issuer.entity';
import { CardBenefitProgramEntity } from './entities/card-benefit-program.entity';
import { TravelAssistanceEnrollmentEntity } from './entities/travel-assistance-enrollment.entity';
import { CoverageAcquisitionChannelEntity } from './entities/coverage-acquisition-channel.entity';
import { MemberCardBenefitLinkEntity } from './entities/member-card-benefit-link.entity';
import { CoverageEligibilityRuleEntity } from './entities/coverage-eligibility-rule.entity';
import { CoverageEligibilityVerificationEntity } from './entities/coverage-eligibility-verification.entity';
import { TravelAssistanceCertificateEntity } from './entities/travel-assistance-certificate.entity';
import { HealthCoverageEntity } from './entities/health-coverage.entity';
import { HealthcarePlanEntity } from './entities/healthcare-plan.entity';
import { HealthcareProviderEntity } from './entities/healthcare-provider.entity';
import { CoverageSyncEventEntity } from './entities/coverage-sync-event.entity';
import { CoverageResourceController } from './coverage-resource.controller';
import { PartnerRecordsController } from './partner-records.controller';
import { HealthcarePlansController } from './healthcare-plans.controller';
import { HealthcarePlansAdminController } from './healthcare-plans-admin.controller';
import { HealthcareProvidersController } from './healthcare-providers.controller';
import { HealthcareProvidersAdminController } from './healthcare-providers-admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AssistancePlanEntity,
      PlanCoverageEntity,
      CoverageSponsorEntity,
      CardNetworkEntity,
      CardIssuerEntity,
      CardBenefitProgramEntity,
      TravelAssistanceEnrollmentEntity,
      CoverageAcquisitionChannelEntity,
      MemberCardBenefitLinkEntity,
      CoverageEligibilityRuleEntity,
      CoverageEligibilityVerificationEntity,
      TravelAssistanceCertificateEntity,
      HealthCoverageEntity,
      HealthcarePlanEntity,
      HealthcareProviderEntity,
      CoverageSyncEventEntity,
    ]),
  ],
  controllers: [
    PartnerRecordsController,
    HealthcareProvidersController,
    HealthcareProvidersAdminController,
    HealthcarePlansController,
    HealthcarePlansAdminController,
    CoverageResourceController,
  ],
  exports: [TypeOrmModule],
})
export class CoverageModule {}
