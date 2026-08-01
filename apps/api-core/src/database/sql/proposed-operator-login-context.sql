-- ============================================================
-- login() ya resuelve user_id/person_id vía core.get_login_credentials,
-- pero nunca resolvía si ese usuario ES ADEMÁS un operador — sin eso,
-- el JWT nunca llevaba tenantId, y sin esa GUC ninguna política
-- *_tenant_access (gap #8) se activa nunca para un operador real: vería
-- 0 filas en todo /operations, /operators, etc. aunque tuviera acceso
-- legítimo. Mismo problema de "huevo y gallina" que get_login_credentials
-- resuelve para core.users: hace falta leer operations.operators ANTES
-- de tener el tenantId que esa misma RLS necesitaría para dejarlo ver.
-- No se toca el baseline 000-009 aprobado; aplicar como patch adicional.
-- ============================================================

DROP FUNCTION IF EXISTS operations.get_operator_login_context(UUID);

CREATE OR REPLACE FUNCTION operations.get_operator_login_context(p_user_id UUID)
RETURNS TABLE (
  operator_id UUID,
  tenant_id UUID,
  can_manage_config BOOLEAN,
  can_manage_operators BOOLEAN,
  can_close_cases BOOLEAN,
  can_access_medical BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, operations AS $$
BEGIN
  RETURN QUERY
  SELECT op.id, op.tenant_id, r.can_manage_config, r.can_manage_operators, r.can_close_cases, r.can_access_medical
  FROM operations.operators op
  JOIN operations.operator_roles r ON r.id = op.role_id
  WHERE op.user_id = p_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION operations.get_operator_login_context(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION operations.get_operator_login_context(UUID)
  TO app_runtime, test_runner;
