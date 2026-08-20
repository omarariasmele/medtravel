-- ============================================================
-- Gap #42: "Seguro médico / obra social" cargado desde la app (person_id
-- directo, sin member_id — gap #21/proposed-healthcare-plans.sql) nunca
-- se veía en admin-web ("Usuarios"/"Usuarios sin cobertura"). hc_select
-- (ALTER POLICY en proposed-healthcare-plans.sql) solo tiene tres
-- caminos: (1) el propio titular vía member_id, (2) el propio titular
-- vía person_id, (3) un operador con consentimiento explícito vía
-- member_id — ninguno cubre "operador de este tenant viendo una fila
-- person_id-only de uno de sus propios members", que es EXACTAMENTE
-- el caso de un viajero que carga su prepaga desde la app sin pasar
-- por ningún flujo de consentimiento. Mismo patrón ya usado para
-- member_contacts (gap #37): agrega el camino "person_id pertenece a
-- un member de mi tenant" + el bypass de superadmin.
-- ============================================================

ALTER POLICY hc_select ON coverage.health_coverages
  USING (
    member_id IN (SELECT id FROM core.members WHERE person_id = app.current_uuid('app.current_person_id'))
    OR person_id = app.current_uuid('app.current_person_id')
    OR (app.current_uuid('app.current_tenant_id') IS NOT NULL AND member_id IN (
        SELECT mdc.member_id FROM core.member_data_consents mdc
        JOIN params.consent_purposes cp ON mdc.purpose_id = cp.id
        JOIN core.members m ON mdc.member_id = m.id
        WHERE m.tenant_id = app.current_uuid('app.current_tenant_id')
          AND mdc.granted = TRUE AND (mdc.valid_until IS NULL OR mdc.valid_until > NOW())
          AND cp.code = 'HEALTH_COVERAGE_ACCESS'))
    OR person_id IN (
        SELECT person_id FROM core.members
        WHERE tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  );
