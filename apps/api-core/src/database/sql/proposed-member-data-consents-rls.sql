-- ============================================================
-- Gap #15 (SCHEMA_GAPS.md): core.member_data_consents tiene
-- ENABLE ROW LEVEL SECURITY (003_core_identity.sql) pero NUNCA tuvo
-- ninguna política — en Postgres eso significa denegar TODO acceso
-- para cualquier rol sin bypass (ni siquiera el propio titular podía
-- leer o dar de alta su propio consentimiento vía la API genérica).
--
-- Impacto real detectado: hc_select (004_coverage.sql) hace un JOIN
-- contra esta tabla para el caso "tenant con consentimiento" — como el
-- JOIN corre con los privilegios de app_runtime (no es SECURITY
-- DEFINER), la ausencia de política acá hacía que ESE JOIN devolviera
-- siempre vacío, aunque el consentimiento existiera y estuviera bien
-- otorgado. clinical.has_clinical_access() NO se ve afectada porque es
-- SECURITY DEFINER y corre como owner, bypasseando RLS para su propio
-- chequeo interno — este bug es específico de accesos que consultan
-- la tabla directamente bajo RLS normal.
--
-- Mismo patrón que hc_select/hc_insert/hc_update: el titular controla
-- sus propios consentimientos (INSERT/UPDATE); el tenant solo puede
-- LEER el estado (para saber si tiene acceso), nunca otorgar consentimiento
-- en nombre del viajero.
-- ============================================================

CREATE POLICY member_data_consents_select ON core.member_data_consents
  FOR SELECT
  USING (
    tenant_id = app.current_uuid('app.current_tenant_id')
    OR member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
  );

CREATE POLICY member_data_consents_insert ON core.member_data_consents
  FOR INSERT
  WITH CHECK (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
  );

CREATE POLICY member_data_consents_update ON core.member_data_consents
  FOR UPDATE
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
  )
  WITH CHECK (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
  );
