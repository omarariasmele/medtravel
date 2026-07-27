-- ============================================================
-- NO forma parte del schema SQL v1.2.3 aprobado. Es un parche detectado
-- en vivo: 002_params.sql (a diferencia de 001/003/004/005/006/007) no
-- tiene NINGÚN GRANT a app_runtime sobre sus propias tablas — solo
-- GRANT USAGE ON SCHEMA (000_extensions.sql). Como params.* no tiene RLS,
-- sin estos GRANT cualquier query de la app falla con
-- "permiso denegado a la tabla ..." para las 23 tablas de params.
--
-- Este archivo replica el mismo patrón de GRANT que ya usan el resto de
-- los módulos del schema. Hay que reportarlo para que se sume a la
-- próxima revisión del SQL aprobado (falta en 002_params.sql).
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON
  params.domain_catalogs,
  params.catalog_values,
  params.catalog_translations,
  params.workflow_definitions,
  params.state_transitions,
  params.workflow_actions,
  params.policy_rules,
  params.rule_conditions,
  params.rule_actions,
  params.form_schemas,
  params.field_definitions,
  params.validation_rules,
  params.design_token_sets,
  params.tenant_themes,
  params.partner_api_profiles,
  params.field_mappings,
  params.integration_contracts,
  params.feature_flags,
  params.flag_overrides,
  params.operational_limits,
  params.retention_policies,
  params.consent_purposes,
  params.jurisdiction_rules
TO app_runtime;

GRANT SELECT ON
  params.domain_catalogs,
  params.catalog_values,
  params.catalog_translations
TO readonly_support;
