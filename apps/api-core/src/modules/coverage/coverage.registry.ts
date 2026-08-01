import { EntityTarget, ObjectLiteral } from 'typeorm';

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
import { TravelAssistanceCertificateEntity } from './entities/travel-assistance-certificate.entity';
import { HealthCoverageEntity } from './entities/health-coverage.entity';

/**
 * Excluidos a propósito: coverage-eligibility-verifications y
 * coverage-sync-events (system-driven, resultado de procesos de
 * verificación/sincronización, no recursos para crear/editar a mano).
 */
export const COVERAGE_REGISTRY: Record<string, EntityTarget<ObjectLiteral>> = {
  'assistance-plans': AssistancePlanEntity,
  'plan-coverages': PlanCoverageEntity,
  'coverage-sponsors': CoverageSponsorEntity,
  'card-networks': CardNetworkEntity,
  'card-issuers': CardIssuerEntity,
  'card-benefit-programs': CardBenefitProgramEntity,
  'travel-assistance-enrollments': TravelAssistanceEnrollmentEntity,
  'coverage-acquisition-channels': CoverageAcquisitionChannelEntity,
  'member-card-benefit-links': MemberCardBenefitLinkEntity,
  'coverage-eligibility-rules': CoverageEligibilityRuleEntity,
  'travel-assistance-certificates': TravelAssistanceCertificateEntity,
  'health-coverages': HealthCoverageEntity,
};
