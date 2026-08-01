-- ============================================================
-- Gap encontrado armando la pantalla "Empresas" (tenants) del panel:
-- core.tenants NUNCA tuvo RLS habilitada — cualquier operador
-- autenticado, de cualquier empresa, podía listar/editar TODAS las
-- empresas del sistema vía GET/PATCH /identity/tenants, y hasta crear
-- una empresa nueva vía POST. El resto del sistema (members, cases,
-- coverages, etc.) sí está bien scopeado por tenant_id — esta era la
-- única tabla raíz sin ninguna restricción.
--
-- Diseño: un operador ve/edita SOLO su propio tenant (coincide con lo
-- que ya usa el dashboard: GET /identity/tenants/:id con su propio
-- tenantId). Un operador con can_manage_config = TRUE (superadmin) ve y
-- administra TODAS las empresas, incluida el alta de una nueva — eso
-- es justo lo que la pantalla "Empresas" necesita, y coincide con el
-- modelo ya usado para "Operadores"/"Catálogos" (ConfigAccessGuard).
--
-- Se necesita una función SECURITY DEFINER (mismo patrón que
-- has_clinical_access) porque RLS solo puede leer GUCs de sesión
-- (app.current_tenant_id, etc.), no el permiso can_manage_config del
-- rol del operador — hay que resolverlo consultando
-- operations.operators/operator_roles.
-- ============================================================

CREATE OR REPLACE FUNCTION core.current_operator_can_manage_config()
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, operations AS $$
DECLARE
  v_user UUID;
  v_can  BOOLEAN;
BEGIN
  v_user := app.current_uuid('app.current_user_id');
  IF v_user IS NULL THEN
    RETURN FALSE;
  END IF;

  SELECT r.can_manage_config INTO v_can
  FROM operations.operators op
  JOIN operations.operator_roles r ON r.id = op.role_id
  WHERE op.user_id = v_user;

  RETURN COALESCE(v_can, FALSE);
END;
$$;
REVOKE EXECUTE ON FUNCTION core.current_operator_can_manage_config() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.current_operator_can_manage_config()
  TO app_runtime, test_runner;

ALTER TABLE core.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.tenants FORCE ROW LEVEL SECURITY;

CREATE POLICY tenants_self_or_config_admin ON core.tenants
  USING (
    id = app.current_uuid('app.current_tenant_id')
    OR core.current_operator_can_manage_config()
  );
