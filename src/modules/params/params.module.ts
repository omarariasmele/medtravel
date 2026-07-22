import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DomainCatalogEntity } from './entities/domain-catalog.entity';
import { CatalogValueEntity } from './entities/catalog-value.entity';
import { CatalogTranslationEntity } from './entities/catalog-translation.entity';
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

import { CatalogsService } from './catalogs.service';
import { CatalogsController } from './catalogs.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
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
    ]),
  ],
  controllers: [CatalogsController],
  providers: [CatalogsService],
  exports: [TypeOrmModule],
})
export class ParamsModule {}
