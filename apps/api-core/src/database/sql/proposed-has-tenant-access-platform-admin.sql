-- ============================================================
-- Gap #59: core.has_tenant_access() es el helper compartido detrás de
-- 14 políticas RLS distintas (case_participants, chat_channels,
-- message_attachments, message_reads, chat_translations,
-- tenant_access_requests, operators, operator_roles, operator_presence)
-- y nunca tuvo en cuenta al administrador de la plataforma — mismo
-- patrón que los gaps #49/#54/#58, pero encontrado ahí ya tres veces
-- parcheando política por política. Se corrige acá, en el helper
-- compartido, de una sola vez, para no seguir descubriéndolo tabla por
-- tabla.
--
-- Encontrado construyendo el chat de operador en admin-web: un
-- operador de OYSGROUP con acceso a un caso de AXA (vía cases_access,
-- que SÍ tiene el bypass) no podía sumarse como case_participant de
-- ese caso (case_participants_insert, que usa has_tenant_access sin
-- el bypass) — bloqueando el auto-join al chat.
-- ============================================================

CREATE OR REPLACE FUNCTION core.has_tenant_access(p_tenant_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'core', 'audit', 'app'
AS $function$
DECLARE
  v_tenant UUID;
  v_user   UUID;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN FALSE; END IF;
  v_tenant := app.current_uuid('app.current_tenant_id');
  IF v_tenant IS NOT NULL AND v_tenant = p_tenant_id THEN
    RETURN TRUE;
  END IF;
  v_user := app.current_uuid('app.current_user_id');
  IF v_user IS NOT NULL AND audit.has_tenant_break_glass(v_user, p_tenant_id) THEN
    RETURN TRUE;
  END IF;
  IF core.current_operator_can_manage_config() THEN
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$function$;
