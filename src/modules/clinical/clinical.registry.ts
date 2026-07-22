import { EntityTarget, ObjectLiteral } from 'typeorm';

import { AllergyEntity } from './entities/allergy.entity';
import { ConditionEntity } from './entities/condition.entity';
import { MedicationEntity } from './entities/medication.entity';
import { SurgeryEntity } from './entities/surgery.entity';
import { LabResultEntity } from './entities/lab-result.entity';
import { VitalsHistoryEntity } from './entities/vitals-history.entity';
import { VaccineEntity } from './entities/vaccine.entity';
import { ClinicalDocumentEntity } from './entities/clinical-document.entity';
import { DocumentShareEntity } from './entities/document-share.entity';
import { HealthcareProfessionalEntity } from './entities/healthcare-professional.entity';
import { ProfessionalCertificationEntity } from './entities/professional-certification.entity';
import { HealthcareOrganizationEntity } from './entities/healthcare-organization.entity';
import { EncounterEntity } from './entities/encounter.entity';
import { EncounterLocationEntity } from './entities/encounter-location.entity';
import { EncounterSubmissionEntity } from './entities/encounter-submission.entity';
import { RecordReviewTaskEntity } from './entities/record-review-task.entity';
import { SubmissionVisibilityPolicyEntity } from './entities/submission-visibility-policy.entity';

/**
 * Excluidos a propósito: document-ai-processing (encolado vía BullMQ, no
 * un recurso para crear a mano), professional-verification-attempts,
 * organization-candidates/organization-match-decisions (pipeline de
 * deduplicación MTA-511, system-driven).
 */
export const CLINICAL_REGISTRY: Record<string, EntityTarget<ObjectLiteral>> = {
  allergies: AllergyEntity,
  conditions: ConditionEntity,
  medications: MedicationEntity,
  surgeries: SurgeryEntity,
  'lab-results': LabResultEntity,
  'vitals-history': VitalsHistoryEntity,
  vaccines: VaccineEntity,
  documents: ClinicalDocumentEntity,
  'document-shares': DocumentShareEntity,
  'healthcare-professionals': HealthcareProfessionalEntity,
  'professional-certifications': ProfessionalCertificationEntity,
  'healthcare-organizations': HealthcareOrganizationEntity,
  encounters: EncounterEntity,
  'encounter-locations': EncounterLocationEntity,
  'encounter-submissions': EncounterSubmissionEntity,
  'record-review-tasks': RecordReviewTaskEntity,
  'submission-visibility-policies': SubmissionVisibilityPolicyEntity,
};
