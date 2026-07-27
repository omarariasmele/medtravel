import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

import { CatalogValueEntity } from '@modules/params/entities/catalog-value.entity';
import { DomainCatalogEntity } from '@modules/params/entities/domain-catalog.entity';
import { CatalogTranslationEntity } from '@modules/params/entities/catalog-translation.entity';
import { WorkflowDefinitionEntity } from '@modules/params/entities/workflow-definition.entity';
import { StateTransitionEntity } from '@modules/params/entities/state-transition.entity';
import { WorkflowActionEntity } from '@modules/params/entities/workflow-action.entity';
import { PolicyRuleEntity } from '@modules/params/entities/policy-rule.entity';
import { RuleConditionEntity } from '@modules/params/entities/rule-condition.entity';
import { RuleActionEntity } from '@modules/params/entities/rule-action.entity';
import { FormSchemaEntity } from '@modules/params/entities/form-schema.entity';
import { FieldDefinitionEntity } from '@modules/params/entities/field-definition.entity';
import { ValidationRuleEntity } from '@modules/params/entities/validation-rule.entity';
import { DesignTokenSetEntity } from '@modules/params/entities/design-token-set.entity';
import { TenantThemeEntity } from '@modules/params/entities/tenant-theme.entity';
import { PartnerApiProfileEntity } from '@modules/params/entities/partner-api-profile.entity';
import { FieldMappingEntity } from '@modules/params/entities/field-mapping.entity';
import { IntegrationContractEntity } from '@modules/params/entities/integration-contract.entity';
import { FeatureFlagEntity } from '@modules/params/entities/feature-flag.entity';
import { FlagOverrideEntity } from '@modules/params/entities/flag-override.entity';
import { OperationalLimitEntity } from '@modules/params/entities/operational-limit.entity';
import { RetentionPolicyEntity } from '@modules/params/entities/retention-policy.entity';
import { ConsentPurposeEntity } from '@modules/params/entities/consent-purpose.entity';
import { JurisdictionRuleEntity } from '@modules/params/entities/jurisdiction-rule.entity';

import { DataAuditEventEntity } from '@modules/audit/entities/data-audit-event.entity';
import { BreakGlassGrantEntity } from '@modules/audit/entities/break-glass-grant.entity';
import { DataArchiveRecordEntity } from '@modules/audit/entities/data-archive-record.entity';
import { DataAnonymizationJobEntity } from '@modules/audit/entities/data-anonymization-job.entity';
import { DataSuppressionRequestEntity } from '@modules/audit/entities/data-suppression-request.entity';
import { AccessNotificationEntity } from '@modules/audit/entities/access-notification.entity';

import { TenantEntity } from '@modules/identity/entities/tenant.entity';
import { TenantAppVariantEntity } from '@modules/identity/entities/tenant-app-variant.entity';
import { TenantBrandProfileEntity } from '@modules/identity/entities/tenant-brand-profile.entity';
import { PersonEntity } from '@modules/identity/entities/person.entity';
import { ExternalIdentifierEntity } from '@modules/identity/entities/external-identifier.entity';
import { UserEntity } from '@modules/identity/entities/user.entity';
import { AuthenticationCredentialEntity } from '@modules/identity/entities/authentication-credential.entity';
import { PasswordResetTokenEntity } from '@modules/identity/entities/password-reset-token.entity';
import { MfaMethodEntity } from '@modules/identity/entities/mfa-method.entity';
import { SecuritySessionEntity } from '@modules/identity/entities/security-session.entity';
import { MemberEntity } from '@modules/identity/entities/member.entity';
import { PartnerMemberRecordEntity } from '@modules/identity/entities/partner-member-record.entity';
import { IdentityMatchCandidateEntity } from '@modules/identity/entities/identity-match-candidate.entity';
import { IdentityMatchDecisionEntity } from '@modules/identity/entities/identity-match-decision.entity';
import { MemberDataConsentEntity } from '@modules/identity/entities/member-data-consent.entity';
import { MemberContactEntity } from '@modules/identity/entities/member-contact.entity';

import { AssistancePlanEntity } from '@modules/coverage/entities/assistance-plan.entity';
import { PlanCoverageEntity } from '@modules/coverage/entities/plan-coverage.entity';
import { CoverageSponsorEntity } from '@modules/coverage/entities/coverage-sponsor.entity';
import { CardNetworkEntity } from '@modules/coverage/entities/card-network.entity';
import { CardIssuerEntity } from '@modules/coverage/entities/card-issuer.entity';
import { CardBenefitProgramEntity } from '@modules/coverage/entities/card-benefit-program.entity';
import { TravelAssistanceEnrollmentEntity } from '@modules/coverage/entities/travel-assistance-enrollment.entity';
import { CoverageAcquisitionChannelEntity } from '@modules/coverage/entities/coverage-acquisition-channel.entity';
import { MemberCardBenefitLinkEntity } from '@modules/coverage/entities/member-card-benefit-link.entity';
import { CoverageEligibilityRuleEntity } from '@modules/coverage/entities/coverage-eligibility-rule.entity';
import { CoverageEligibilityVerificationEntity } from '@modules/coverage/entities/coverage-eligibility-verification.entity';
import { TravelAssistanceCertificateEntity } from '@modules/coverage/entities/travel-assistance-certificate.entity';
import { HealthCoverageEntity } from '@modules/coverage/entities/health-coverage.entity';
import { CoverageSyncEventEntity } from '@modules/coverage/entities/coverage-sync-event.entity';

import { AllergyEntity } from '@modules/clinical/entities/allergy.entity';
import { ConditionEntity } from '@modules/clinical/entities/condition.entity';
import { MedicationEntity } from '@modules/clinical/entities/medication.entity';
import { SurgeryEntity } from '@modules/clinical/entities/surgery.entity';
import { LabResultEntity } from '@modules/clinical/entities/lab-result.entity';
import { VitalsHistoryEntity } from '@modules/clinical/entities/vitals-history.entity';
import { VaccineEntity } from '@modules/clinical/entities/vaccine.entity';
import { ClinicalDocumentEntity } from '@modules/clinical/entities/clinical-document.entity';
import { DocumentAiProcessingEntity } from '@modules/clinical/entities/document-ai-processing.entity';
import { DocumentShareEntity } from '@modules/clinical/entities/document-share.entity';
import { HealthcareProfessionalEntity } from '@modules/clinical/entities/healthcare-professional.entity';
import { ProfessionalVerificationAttemptEntity } from '@modules/clinical/entities/professional-verification-attempt.entity';
import { ProfessionalCertificationEntity } from '@modules/clinical/entities/professional-certification.entity';
import { HealthcareOrganizationEntity } from '@modules/clinical/entities/healthcare-organization.entity';
import { OrganizationCandidateEntity } from '@modules/clinical/entities/organization-candidate.entity';
import { OrganizationMatchDecisionEntity } from '@modules/clinical/entities/organization-match-decision.entity';
import { EncounterEntity } from '@modules/clinical/entities/encounter.entity';
import { EncounterLocationEntity } from '@modules/clinical/entities/encounter-location.entity';
import { EncounterSubmissionEntity } from '@modules/clinical/entities/encounter-submission.entity';
import { RecordReviewTaskEntity } from '@modules/clinical/entities/record-review-task.entity';
import { SubmissionVisibilityPolicyEntity } from '@modules/clinical/entities/submission-visibility-policy.entity';

import { EmergencyProfileEntity } from '@modules/emergency/entities/emergency-profile.entity';
import { EmergencyTokenEntity } from '@modules/emergency/entities/emergency-token.entity';
import { SignedOfflineAccessEntity } from '@modules/emergency/entities/signed-offline-access.entity';
import { EmergencyAccessLogEntity } from '@modules/emergency/entities/emergency-access-log.entity';
import { TokenUsageLogEntity } from '@modules/emergency/entities/token-usage-log.entity';

import { TripEntity } from '@modules/operations/entities/trip.entity';
import { TripDestinationEntity } from '@modules/operations/entities/trip-destination.entity';
import { EmergencyCaseEntity } from '@modules/operations/entities/emergency-case.entity';
import { CaseParticipantEntity } from '@modules/operations/entities/case-participant.entity';
import { CaseStatusHistoryEntity } from '@modules/operations/entities/case-status-history.entity';
import { CaseLocationHistoryEntity } from '@modules/operations/entities/case-location-history.entity';
import { CaseMedicalEventEntity } from '@modules/operations/entities/case-medical-event.entity';
import { CaseSlaLogEntity } from '@modules/operations/entities/case-sla-log.entity';
import { ChatChannelEntity } from '@modules/operations/entities/chat-channel.entity';
import { ChatMessageEntity } from '@modules/operations/entities/chat-message.entity';
import { MessageAttachmentEntity } from '@modules/operations/entities/message-attachment.entity';
import { MessageReadEntity } from '@modules/operations/entities/message-read.entity';
import { ChatTranslationEntity } from '@modules/operations/entities/chat-translation.entity';
import { OperatorRoleEntity } from '@modules/operations/entities/operator-role.entity';
import { OperatorEntity } from '@modules/operations/entities/operator.entity';
import { OperatorSessionEntity } from '@modules/operations/entities/operator-session.entity';
import { OperatorPresenceEntity } from '@modules/operations/entities/operator-presence.entity';
import { OperatorAuditLogEntity } from '@modules/operations/entities/operator-audit-log.entity';
import { TenantAnalyticsCacheEntity } from '@modules/operations/entities/tenant-analytics-cache.entity';
import { TenantAccessRequestEntity } from '@modules/operations/entities/tenant-access-request.entity';

/**
 * synchronize/migrationsRun quedan en false: el schema es el SQL v1.2.3
 * aprobado (ver src/database/migrations), no algo que TypeORM deba inferir
 * o alterar automáticamente.
 */
export const buildTypeOrmOptions = (
  config: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: config.get<string>('DB_HOST'),
  port: config.get<number>('DB_PORT'),
  username: config.get<string>('DB_USERNAME'),
  password: config.get<string>('DB_PASSWORD'),
  database: config.get<string>('DB_DATABASE'),
  ssl: config.get<boolean>('DB_SSL') ? { rejectUnauthorized: false } : false,
  synchronize: false,
  migrationsRun: false,
  logging: config.get<string>('NODE_ENV') === 'development',
  // app.encryption_key la necesita core.encrypt_pii/decrypt_pii — a nivel
  // de conexión (no por-request como el resto de las GUCs en
  // TenantTransactionManager), vía startup options de Postgres
  // (equivalente a PGOPTIONS). Sin esto, cualquier INSERT/SELECT que
  // pase por esas funciones falla con "app.encryption_key no configurada".
  extra: {
    options: `-c app.encryption_key=${config.get<string>('DB_ENCRYPTION_KEY')}`,
  },
  entities: [
    // params
    DomainCatalogEntity,
    CatalogValueEntity,
    CatalogTranslationEntity,
    WorkflowDefinitionEntity,
    StateTransitionEntity,
    WorkflowActionEntity,
    PolicyRuleEntity,
    RuleConditionEntity,
    RuleActionEntity,
    FormSchemaEntity,
    FieldDefinitionEntity,
    ValidationRuleEntity,
    DesignTokenSetEntity,
    TenantThemeEntity,
    PartnerApiProfileEntity,
    FieldMappingEntity,
    IntegrationContractEntity,
    FeatureFlagEntity,
    FlagOverrideEntity,
    OperationalLimitEntity,
    RetentionPolicyEntity,
    ConsentPurposeEntity,
    JurisdictionRuleEntity,
    // audit
    DataAuditEventEntity,
    BreakGlassGrantEntity,
    DataArchiveRecordEntity,
    DataAnonymizationJobEntity,
    DataSuppressionRequestEntity,
    AccessNotificationEntity,
    // identity (core)
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
    // coverage
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
    CoverageSyncEventEntity,
    // clinical
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
    // emergency
    EmergencyProfileEntity,
    EmergencyTokenEntity,
    SignedOfflineAccessEntity,
    EmergencyAccessLogEntity,
    TokenUsageLogEntity,
    // operations
    TripEntity,
    TripDestinationEntity,
    EmergencyCaseEntity,
    CaseParticipantEntity,
    CaseStatusHistoryEntity,
    CaseLocationHistoryEntity,
    CaseMedicalEventEntity,
    CaseSlaLogEntity,
    ChatChannelEntity,
    ChatMessageEntity,
    MessageAttachmentEntity,
    MessageReadEntity,
    ChatTranslationEntity,
    OperatorRoleEntity,
    OperatorEntity,
    OperatorSessionEntity,
    OperatorPresenceEntity,
    OperatorAuditLogEntity,
    TenantAnalyticsCacheEntity,
    TenantAccessRequestEntity,
  ],
});
