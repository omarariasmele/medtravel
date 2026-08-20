-- ============================================================
-- Bug real reportado en vivo: "cuando quiero compartir por mail o
-- generar link me dice que no se pudo" — el server devolvía "el nuevo
-- registro viola la política de seguridad de registros para la tabla
-- «tokens»" (RLS).
--
-- Causa raíz: proposed-emergency-tokens-person-id.sql agregó
-- person_id como alternativa a member_id en emergency.tokens (para
-- viajeros sin cobertura, sin fila en core.members), pero las
-- políticas RLS de esa tabla (007_operations.sql) nunca se
-- actualizaron — tokens_insert exige member_id IN (...) sin excepción,
-- así que cualquier INSERT con member_id NULL (viajero sin member)
-- viola el WITH CHECK sin importar que person_id sí sea correcto.
-- Mismo problema en tokens_titular (SELECT).
-- ============================================================

DROP POLICY IF EXISTS tokens_titular ON emergency.tokens;
CREATE POLICY tokens_titular ON emergency.tokens
  FOR SELECT TO app_runtime
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    OR member_id IN (
      SELECT ec.member_id FROM operations.emergency_cases ec
      WHERE ec.id = app.current_uuid('app.active_case_id')
        AND ec.tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR person_id = app.current_uuid('app.current_person_id')
  );

DROP POLICY IF EXISTS tokens_insert ON emergency.tokens;
CREATE POLICY tokens_insert ON emergency.tokens
  FOR INSERT TO app_runtime
  WITH CHECK (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    OR person_id = app.current_uuid('app.current_person_id')
  );
