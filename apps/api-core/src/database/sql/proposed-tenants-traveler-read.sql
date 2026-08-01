-- ============================================================
-- Gap encontrado construyendo /me/coverages con la póliza validada
-- (proposed-partner-matching-*.sql): tenants_self_or_config_admin
-- (proposed-tenants-rls.sql) solo deja ver un tenant a un operador de
-- ese mismo tenant o a un superadmin — un VIAJERO (que no es operador,
-- no tiene tenantId en su sesión) no podía ver el nombre de su propia
-- empresa de seguros/asistencia, aunque sí podía ver su propio
-- enrollment (coverage.travel_assistance_enrollments ya lo permite vía
-- "titular ve lo propio"). Mismo criterio que ya se usó para persons/
-- members/cases/trips: esto solo AMPLÍA quién puede leer (SELECT), no
-- reemplaza ni restringe nada de lo que ya podía ver un operador.
-- ============================================================

ALTER POLICY tenants_self_or_config_admin ON core.tenants
  USING (
    id = app.current_uuid('app.current_tenant_id')
    OR core.current_operator_can_manage_config()
    OR id IN (
      SELECT tenant_id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
  );
