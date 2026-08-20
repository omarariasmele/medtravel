-- ============================================================
-- Gap #54: case_medical_events_access (proposed-case-medical-events-rls.sql)
-- tenía un WITH CHECK más angosto que su propio USING — el USING ya
-- dejaba ver el historial de CUALQUIER caso a un operador de
-- plataforma (gap #43/#49, core.current_operator_can_manage_config()
-- vía cases_access), pero el WITH CHECK (que gatea el INSERT de una
-- nota nueva) solo permitía `ec.tenant_id = current_tenant_id` — un
-- operador de OYSGROUP podía VER el "Historial del caso" de un caso de
-- AXA pero no podía AGREGAR una nota ahí ("No autorizado para esta
-- operación", 403). Reportado por el usuario en vivo.
--
-- Diagnosticado en profundidad: agregar el bypass SOLO al WITH CHECK
-- no alcanzaba — `RlsCrudService.create()` siempre hace `INSERT ...
-- RETURNING`, y Postgres evalúa el USING (no solo el WITH CHECK) sobre
-- la fila recién insertada para poder devolverla; si el USING no
-- también tiene el bypass, el INSERT "pasa" pero el RETURNING falla
-- con el mismo error genérico de RLS (confirmado con WITH CHECK(true)
-- a mano: seguía fallando hasta agregar el bypass también al USING).
-- Se corrigen las dos cláusulas.
-- ============================================================

ALTER POLICY case_medical_events_access ON operations.case_medical_events
  USING (
    EXISTS (
      SELECT 1 FROM operations.emergency_cases ec
      WHERE ec.id = case_medical_events.case_id
        AND ec.tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    OR core.current_operator_can_manage_config()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operations.emergency_cases ec
      WHERE ec.id = case_medical_events.case_id
        AND ec.tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  );
