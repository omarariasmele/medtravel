-- ============================================================
-- Bug real encontrado probando "Correo (SMTP)" con el superadmin real:
-- core.has_platform_config_access() (proposed-password-reset-and-smtp.sql)
-- exige op.tenant_id IS NULL — pensado para un "operador de plataforma"
-- puro (staff de OYSGROUP sin tenant propio) que nunca se llegó a crear
-- (el propio archivo original dice "crear el primer Superadmin real es
-- un paso manual de bootstrap" y ese paso nunca se hizo). El superadmin
-- real que sí existe (operations.operators con can_manage_config=TRUE)
-- tiene tenant_id = OYSGROUP Demo, no NULL — así que el INSERT en
-- params.smtp_settings fallaba con "viola la política de seguridad de
-- registros" pese a que el usuario tiene el permiso correcto.
--
-- Fix: alinear has_platform_config_access() con el mismo criterio que
-- ya usa core.current_operator_can_manage_config() (tenants RLS) y el
-- resto del panel (Operadores, Catálogos) — con o sin tenant, lo único
-- que importa es can_manage_config = TRUE. No se toca
-- core.is_platform_operator() ni el carve-out de tenant_id IS NULL en
-- operators_tenant_access/operator_roles_tenant_access/
-- operator_presence_tenant_access: como ningún operador tiene tenant_id
-- NULL hoy, esa rama nunca se ejecuta en la práctica, así que este
-- cambio no afecta ese otro comportamiento.
-- ============================================================

CREATE OR REPLACE FUNCTION core.has_platform_config_access()
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, operations, app AS $$
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
  WHERE op.user_id = v_user
    AND r.active = TRUE;

  RETURN COALESCE(v_can, FALSE);
END;
$$;
REVOKE EXECUTE ON FUNCTION core.has_platform_config_access() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.has_platform_config_access()
  TO app_runtime, test_runner;
