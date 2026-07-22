import { EntityTarget, ObjectLiteral } from 'typeorm';

import { WorkflowDefinitionEntity } from './entities/workflow-definition.entity';
import { StateTransitionEntity } from './entities/state-transition.entity';
import { WorkflowActionEntity } from './entities/workflow-action.entity';
import { PolicyRuleEntity } from './entities/policy-rule.entity';
import { RuleConditionEntity } from './entities/rule-condition.entity';
import { RuleActionEntity } from './entities/rule-action.entity';
import { FormSchemaEntity } from './entities/form-schema.entity';
import { FieldDefinitionEntity } from './entities/field-definition.entity';
import { ValidationRuleEntity } from './entities/validation-rule.entity';
import { DesignTokenSetEntity } from './entities/design-token-set.entity';
import { TenantThemeEntity } from './entities/tenant-theme.entity';
import { PartnerApiProfileEntity } from './entities/partner-api-profile.entity';
import { FieldMappingEntity } from './entities/field-mapping.entity';
import { IntegrationContractEntity } from './entities/integration-contract.entity';
import { FeatureFlagEntity } from './entities/feature-flag.entity';
import { FlagOverrideEntity } from './entities/flag-override.entity';
import { OperationalLimitEntity } from './entities/operational-limit.entity';
import { RetentionPolicyEntity } from './entities/retention-policy.entity';
import { ConsentPurposeEntity } from './entities/consent-purpose.entity';
import { JurisdictionRuleEntity } from './entities/jurisdiction-rule.entity';

/**
 * Resto de tablas de params (config/admin), separadas de
 * domain-catalogs/catalog-values/catalog-translations que ya tienen su
 * propio controller dedicado en catalogs.controller.ts
 * (GET /params/catalogs/:domainCode) — este registro monta en
 * /params/admin/:resource para no pisar esa ruta.
 */
export const PARAMS_REGISTRY: Record<string, EntityTarget<ObjectLiteral>> = {
  'workflow-definitions': WorkflowDefinitionEntity,
  'state-transitions': StateTransitionEntity,
  'workflow-actions': WorkflowActionEntity,
  'policy-rules': PolicyRuleEntity,
  'rule-conditions': RuleConditionEntity,
  'rule-actions': RuleActionEntity,
  'form-schemas': FormSchemaEntity,
  'field-definitions': FieldDefinitionEntity,
  'validation-rules': ValidationRuleEntity,
  'design-token-sets': DesignTokenSetEntity,
  'tenant-themes': TenantThemeEntity,
  'partner-api-profiles': PartnerApiProfileEntity,
  'field-mappings': FieldMappingEntity,
  'integration-contracts': IntegrationContractEntity,
  'feature-flags': FeatureFlagEntity,
  'flag-overrides': FlagOverrideEntity,
  'operational-limits': OperationalLimitEntity,
  'retention-policies': RetentionPolicyEntity,
  'consent-purposes': ConsentPurposeEntity,
  'jurisdiction-rules': JurisdictionRuleEntity,
};
