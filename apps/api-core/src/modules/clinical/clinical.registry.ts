import { ResourceRegistryEntry } from '@common/database/create-resource-controller';

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
 *
 * Campos de texto libre encriptados en la base (ver
 * proposed-clinical-encryption.sql) — RlsCrudService los desencripta/
 * encripta automáticamente vía `encryptedFields`. Los UUID de catálogo
 * (severidad, tipo, estado) y los valores numéricos de laboratorio/
 * signos vitales NO se encriptan a propósito: no identifican a nadie
 * por sí solos, y en el caso de lab_results/vitals_history encriptarlos
 * rompería el filtrado/indexado por valor que el propio schema pide.
 */
export const CLINICAL_REGISTRY: Record<string, ResourceRegistryEntry> = {
  allergies: {
    entity: AllergyEntity,
    encryptedFields: ['allergenName', 'memberChallengeNotes', 'notes'],
  },
  conditions: {
    entity: ConditionEntity,
    encryptedFields: [
      'conditionName',
      'conditionNameEn',
      'treatingDoctor',
      'treatmentNotes',
      'travelRestrictions',
      'memberChallengeNotes',
      'notes',
    ],
  },
  medications: {
    entity: MedicationEntity,
    encryptedFields: [
      'genericName',
      'brandName',
      'prescribedBy',
      'travelNotes',
      'memberChallengeNotes',
      'notes',
    ],
  },
  surgeries: {
    entity: SurgeryEntity,
    encryptedFields: [
      'procedureName',
      'procedureNameEn',
      'indication',
      'hospitalName',
      'surgeonName',
      'complications',
      'recoveryNotes',
      'implantDetails',
      'memberChallengeNotes',
      'notes',
    ],
  },
  'lab-results': {
    entity: LabResultEntity,
    encryptedFields: ['labName', 'requestedBy', 'aiSummaryEs', 'aiSummaryEn'],
  },
  'vitals-history': {
    entity: VitalsHistoryEntity,
    encryptedFields: ['deviceUsed', 'notes'],
  },
  vaccines: {
    entity: VaccineEntity,
    encryptedFields: [
      'vaccineName',
      'vaccineNameEn',
      'manufacturer',
      'batchNumber',
      'administeredBy',
      'institution',
      'certificateNumber',
    ],
  },
  documents: {
    entity: ClinicalDocumentEntity,
    encryptedFields: [
      'fileNameOriginal',
      'title',
      'description',
      'issuingDoctor',
      'issuingInstitution',
    ],
  },
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
