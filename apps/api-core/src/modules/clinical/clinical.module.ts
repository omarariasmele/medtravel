import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AllergyEntity } from './entities/allergy.entity';
import { ConditionEntity } from './entities/condition.entity';
import { MedicationEntity } from './entities/medication.entity';
import { SurgeryEntity } from './entities/surgery.entity';
import { LabResultEntity } from './entities/lab-result.entity';
import { VitalsHistoryEntity } from './entities/vitals-history.entity';
import { VaccineEntity } from './entities/vaccine.entity';
import { ClinicalDocumentEntity } from './entities/clinical-document.entity';
import { DocumentAiProcessingEntity } from './entities/document-ai-processing.entity';
import { DocumentShareEntity } from './entities/document-share.entity';
import { HealthcareProfessionalEntity } from './entities/healthcare-professional.entity';
import { ProfessionalVerificationAttemptEntity } from './entities/professional-verification-attempt.entity';
import { ProfessionalCertificationEntity } from './entities/professional-certification.entity';
import { HealthcareOrganizationEntity } from './entities/healthcare-organization.entity';
import { OrganizationCandidateEntity } from './entities/organization-candidate.entity';
import { OrganizationMatchDecisionEntity } from './entities/organization-match-decision.entity';
import { EncounterEntity } from './entities/encounter.entity';
import { EncounterLocationEntity } from './entities/encounter-location.entity';
import { EncounterSubmissionEntity } from './entities/encounter-submission.entity';
import { RecordReviewTaskEntity } from './entities/record-review-task.entity';
import { SubmissionVisibilityPolicyEntity } from './entities/submission-visibility-policy.entity';
import { ClinicalResourceController } from './clinical-resource.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AllergyEntity,
      ConditionEntity,
      MedicationEntity,
      SurgeryEntity,
      LabResultEntity,
      VitalsHistoryEntity,
      VaccineEntity,
      ClinicalDocumentEntity,
      DocumentAiProcessingEntity,
      DocumentShareEntity,
      HealthcareProfessionalEntity,
      ProfessionalVerificationAttemptEntity,
      ProfessionalCertificationEntity,
      HealthcareOrganizationEntity,
      OrganizationCandidateEntity,
      OrganizationMatchDecisionEntity,
      EncounterEntity,
      EncounterLocationEntity,
      EncounterSubmissionEntity,
      RecordReviewTaskEntity,
      SubmissionVisibilityPolicyEntity,
    ]),
  ],
  controllers: [ClinicalResourceController],
  exports: [TypeOrmModule],
})
export class ClinicalModule {}
