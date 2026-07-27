-- Gap #9 (ver SCHEMA_GAPS.md): 004_coverage.sql solo otorga GRANT a
-- app_runtime sobre coverage.travel_assistance_certificates — las otras
-- 11 tablas de coverage.* expuestas por el CRUD genérico (assistance_plans,
-- plan_coverages, coverage_sponsors, card_networks, card_issuers,
-- card_benefit_programs, travel_assistance_enrollments,
-- coverage_acquisition_channels, member_card_benefit_links,
-- coverage_eligibility_rules, health_coverages) nunca recibieron ningún
-- GRANT. Mismo patrón que el gap #1 (002_params.sql): sin esto, cualquier
-- query de la app sobre esas tablas falla con
-- "permiso denegado a la tabla ..." — incluso cuando la política RLS
-- correspondiente (ej. hc_insert) sí lo permitiría, el GRANT es un
-- requisito previo e independiente en Postgres.
-- No se toca el baseline 000-009 aprobado; aplicar como patch adicional.

GRANT SELECT, INSERT, UPDATE ON coverage.assistance_plans                TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.plan_coverages                  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.coverage_sponsors               TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.card_networks                  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.card_issuers                   TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.card_benefit_programs          TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.travel_assistance_enrollments  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.coverage_acquisition_channels  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.member_card_benefit_links      TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.coverage_eligibility_rules     TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.health_coverages               TO app_runtime;
