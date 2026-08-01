-- ============================================================
-- ⚠️ TEMPORAL — SOLO PARA PRUEBAS. BORRAR ANTES DE PRODUCCIÓN. ⚠️
--
-- Pedido explícito del usuario: en modo prueba, un superadmin
-- (canManageConfig) necesita poder otorgar/revocar consentimiento en
-- nombre de un viajero de prueba, para poder probar rápido pantallas
-- que dependen de consentimiento (Coberturas, historia clínica fuera de
-- un caso) sin tener que loguearse como cada viajero y usar /me/*.
--
-- Por diseño (proposed-member-data-consents-rls.sql), SOLO el propio
-- titular puede otorgar su consentimiento — un operador nunca debería
-- poder fabricar el consentimiento de un viajero real. Este patch abre
-- una excepción angosta y auditable (solo INSERT/UPDATE, solo
-- canManageConfig, mismo patrón que el resto de los bypasses de esta
-- sesión) exclusivamente para acelerar pruebas.
--
-- PARA REVERTIR ESTO (antes de ir a producción), correr:
--
--   ALTER POLICY member_data_consents_select ON core.member_data_consents
--     USING (
--       tenant_id = app.current_uuid('app.current_tenant_id')
--       OR member_id IN (
--         SELECT id FROM core.members
--         WHERE person_id = app.current_uuid('app.current_person_id')
--       )
--     );
--   ALTER POLICY member_data_consents_insert ON core.member_data_consents
--     WITH CHECK (
--       member_id IN (
--         SELECT id FROM core.members
--         WHERE person_id = app.current_uuid('app.current_person_id')
--       )
--     );
--   ALTER POLICY member_data_consents_update ON core.member_data_consents
--     USING (
--       member_id IN (
--         SELECT id FROM core.members
--         WHERE person_id = app.current_uuid('app.current_person_id')
--       )
--     )
--     WITH CHECK (
--       member_id IN (
--         SELECT id FROM core.members
--         WHERE person_id = app.current_uuid('app.current_person_id')
--       )
--     );
--
-- (Y borrar admin-web/src/pages/test-consents/ + su ruta/nav item.)
-- ============================================================

ALTER POLICY member_data_consents_select ON core.member_data_consents
  USING (
    tenant_id = app.current_uuid('app.current_tenant_id')
    OR member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    OR core.current_operator_can_manage_config()
  );

ALTER POLICY member_data_consents_insert ON core.member_data_consents
  WITH CHECK (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    OR core.current_operator_can_manage_config()
  );

ALTER POLICY member_data_consents_update ON core.member_data_consents
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    OR core.current_operator_can_manage_config()
  )
  WITH CHECK (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    OR core.current_operator_can_manage_config()
  );
