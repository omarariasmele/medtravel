-- ============================================================
-- Gap encontrado probando Fase 1: tenants_self_or_config_admin
-- (proposed-tenants-rls.sql, ampliada en proposed-tenants-traveler-
-- read.sql) solo deja ver un tenant a un operador de ese tenant, un
-- superadmin, o un viajero con core.members en ESE tenant puntual —
-- un viajero SIN ninguna cobertura (el caso exacto para el que existe
-- is_platform_tenant, ver resolveActiveTenant en me-member.helper.ts)
-- no podía ver ni siquiera el tenant de plataforma (OYSGROUP), así que
-- GET /me/tenant-config le daba 404 en vez de la marca por defecto.
--
-- El tenant de plataforma no es sensible (es la marca que ve
-- cualquiera sin empresa) — se agrega como cuarta condición, mismo
-- criterio de "esto solo AMPLÍA quién puede leer" que la migración
-- anterior.
-- ============================================================

ALTER POLICY tenants_self_or_config_admin ON core.tenants
  USING (
    id = app.current_uuid('app.current_tenant_id')
    OR core.current_operator_can_manage_config()
    OR id IN (
      SELECT tenant_id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    OR is_platform_tenant = TRUE
  );
