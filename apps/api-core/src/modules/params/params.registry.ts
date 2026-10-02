import { EntityTarget, ObjectLiteral } from 'typeorm';

import { TenantBrandProfileEntity } from '@modules/identity/entities/tenant-brand-profile.entity';

import { DomainCatalogEntity } from './entities/domain-catalog.entity';
import { CatalogValueEntity } from './entities/catalog-value.entity';
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
 * Resto de tablas de params (config/admin). domain-catalogs/
 * catalog-values también se administran acá (alta/edición real de
 * catálogos — países, tipos de alergia, etc.) — la lectura pública
 * de solo-lectura sigue en catalogs.controller.ts
 * (GET /params/catalogs/:domainCode, sin el guard de abajo, la usa
 * cualquier operador para poblar selects). Todo este controller está
 * gateado con ConfigAccessGuard (ver params-admin-resource.controller.ts):
 * ninguna de estas tablas tiene RLS por tenant, son configuración
 * global del sistema.
 */
export const PARAMS_REGISTRY: Record<string, EntityTarget<ObjectLiteral>> = {
  'domain-catalogs': DomainCatalogEntity,
  'catalog-values': CatalogValueEntity,
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
  'tenant-brand-profiles': TenantBrandProfileEntity,
  'operational-limits': OperationalLimitEntity,
  'retention-policies': RetentionPolicyEntity,
  'consent-purposes': ConsentPurposeEntity,
  'jurisdiction-rules': JurisdictionRuleEntity,
};
