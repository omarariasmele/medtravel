-- Gap real: pedido explícito del usuario al agregar sesión única por
-- usuario en la app móvil ("necesitamos una alternativa desde el
-- entorno web por si algo falla para poder deshabilitarla") — si un
-- viajero pierde el teléfono, desinstala la app sin cerrar sesión, o
-- el token queda vivo por algún motivo, necesita quedar una forma de
-- destrabarlo sin esperar a que expire solo.
--
-- core.security_sessions tiene RLS estrictamente self-only
-- (sessions_self, ver 003_core_identity.sql) — a diferencia de
-- core.members/emergency_cases/trips/travel_assistance_enrollments,
-- nunca se le agregó el bypass de operador (proposed-platform-tenant-
-- and-config-bypass.sql). Se resuelve con una función SECURITY DEFINER
-- puntual en vez de tocar la política (mismo criterio ya usado para
-- email/teléfono de operador sobre un viajero).

INSERT INTO params.domain_catalogs (code, name_es, name_en, allows_tenant_override, is_system)
SELECT code, code, code, FALSE, TRUE
FROM (VALUES ('SESSION_REVOKE_REASON')) AS v(code)
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs WHERE code = 'SESSION_REVOKE_REASON');

WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'SESSION_REVOKE_REASON')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM d, (VALUES
  ('USER_LOGOUT',       'Cierre de sesión del usuario',        'User logout',            1),
  ('OPERATOR_FORCED',   'Cerrada por un operador',             'Closed by an operator',  2),
  ('EXPIRED',           'Vencida',                              'Expired',                3)
) AS v(code, es, en, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code
);

CREATE OR REPLACE FUNCTION core.revoke_active_sessions_for_operator(p_person_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, core, app AS $$
DECLARE
  v_user_id UUID;
  v_count INTEGER;
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM core.members m
      WHERE m.person_id = p_person_id
        AND m.tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  ) THEN
    RAISE EXCEPTION 'No autorizado para administrar la sesión de este viajero';
  END IF;

  SELECT id INTO v_user_id FROM core.users WHERE person_id = p_person_id;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No existe una cuenta de usuario para este viajero';
  END IF;

  UPDATE core.security_sessions
  SET is_active = FALSE,
      revoked_at = NOW(),
      revoke_reason_id = params.catalog_id('SESSION_REVOKE_REASON', 'OPERATOR_FORCED')
  WHERE user_id = v_user_id AND is_active = TRUE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Para que admin-web pueda mostrar si hay una sesión activa antes de
-- ofrecer el botón (evita mostrarlo siempre "por las dudas").
CREATE OR REPLACE FUNCTION core.get_active_session_info_for_operator(p_person_id UUID)
RETURNS TABLE (has_active_session BOOLEAN, session_started_at TIMESTAMPTZ, last_activity_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, core, app AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM core.members m
      WHERE m.person_id = p_person_id
        AND m.tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO v_user_id FROM core.users WHERE person_id = p_person_id;
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT TRUE, s.created_at, s.last_activity_at
  FROM core.security_sessions s
  WHERE s.user_id = v_user_id AND s.is_active = TRUE AND s.expires_at > NOW()
  ORDER BY s.created_at DESC
  LIMIT 1;
END;
$$;
