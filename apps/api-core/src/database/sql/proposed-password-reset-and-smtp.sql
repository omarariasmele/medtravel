-- ============================================================
-- Decisión de producto (2026-07-23):
-- 1. Password reset del member: email con link de un solo uso
--    (core.password_reset_tokens, ya existe en el schema aprobado).
-- 2. Servidor SMTP propio de OYS GROUP — configuración guardada en la
--    base (no en .env), editable solo por el Superadmin.
-- 3. Superadmin = un operations.operator con tenant_id NULL (staff de
--    plataforma, no de un tenant) + operations.operator_roles con
--    can_manage_config = TRUE — reutiliza flags ya existentes en el
--    schema aprobado en vez de inventar un concepto nuevo (el propio
--    schema ya eliminó un flag is_superadmin genérico en versiones
--    anteriores, ver comentarios "B3: is_superadmin eliminado").
--
-- No se toca el baseline 000-009 aprobado; aplicar como patch adicional.
-- Requiere proposed-tenant-access-model.sql ya aplicado (usa
-- core.has_tenant_access, operations.is_active_case_participant y las
-- políticas operators_tenant_access/operator_roles_tenant_access/
-- operator_presence_tenant_access que ese patch crea).
-- ============================================================


-- ── core.password_reset_tokens: RLS de dueño (hardening) ──────
-- Mismo gap que core.mfa_methods antes de su fix (gap #6): tabla
-- sensible sin RLS propia. Nunca se expuso por CRUD genérico, pero
-- conviene la misma defensa en profundidad que sessions_self/
-- mfa_methods_self.

ALTER TABLE core.password_reset_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY password_reset_tokens_self ON core.password_reset_tokens
  USING (
    user_id = app.current_uuid('app.current_user_id')
  );

-- ── core.consume_password_reset_token ──────────────────────────
-- Mismo problema que core.get_login_credentials: hace falta leer (y acá
-- además marcar usado) un token pre-auth, sin tener todavía un
-- app.current_user_id de sesión — password_reset_tokens_self de arriba
-- bloquearía cualquier SELECT/UPDATE normal. Atómico a propósito (UPDATE
-- ... RETURNING en un solo statement): dos requests concurrentes con el
-- mismo token no pueden consumirlo dos veces.
CREATE OR REPLACE FUNCTION core.consume_password_reset_token(p_token_hash TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
DECLARE v_user_id UUID;
BEGIN
  UPDATE core.password_reset_tokens
  SET used = TRUE, used_at = NOW()
  WHERE token_hash = p_token_hash AND used = FALSE AND expires_at > NOW()
  RETURNING user_id INTO v_user_id;
  RETURN v_user_id; -- NULL si no existe, ya se usó, o venció
END;
$$;
REVOKE EXECUTE ON FUNCTION core.consume_password_reset_token(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.consume_password_reset_token(TEXT)
  TO app_runtime, test_runner;

-- TTL del token (B9: nada de valores hardcodeados)
INSERT INTO params.operational_limits (tenant_id, limit_key, limit_value, unit, description_es, requires_approval, lifecycle_status)
SELECT NULL, 'PASSWORD_RESET_TOKEN_TTL_MINUTES', 30, 'minutes',
  'Vigencia del link de reset de contraseña', FALSE, 'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM params.operational_limits
  WHERE limit_key = 'PASSWORD_RESET_TOKEN_TTL_MINUTES' AND tenant_id IS NULL
);


-- ── core.is_platform_operator / core.has_platform_config_access ──
-- SECURITY DEFINER a propósito: consultan operations.operators desde
-- políticas que protegen esa misma tabla — sin esto, mismo bug de
-- auto-recursión que ya se corrigió en operations.is_active_case_participant.

CREATE OR REPLACE FUNCTION core.is_platform_operator()
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, operations, app AS $$
DECLARE v_user UUID;
BEGIN
  v_user := app.current_uuid('app.current_user_id');
  IF v_user IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM operations.operators op
    WHERE op.user_id = v_user AND op.tenant_id IS NULL
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION core.is_platform_operator() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.is_platform_operator()
  TO app_runtime, test_runner;

CREATE OR REPLACE FUNCTION core.has_platform_config_access()
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, operations, app AS $$
DECLARE v_user UUID;
BEGIN
  v_user := app.current_uuid('app.current_user_id');
  IF v_user IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM operations.operators op
    JOIN operations.operator_roles r ON r.id = op.role_id
    WHERE op.user_id = v_user
      AND op.tenant_id IS NULL
      AND r.can_manage_config = TRUE
      AND r.active = TRUE
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION core.has_platform_config_access() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.has_platform_config_access()
  TO app_runtime, test_runner;


-- ── Carve-out: operadores de plataforma (tenant_id NULL) ──────
-- proposed-tenant-access-model.sql dejó las filas con tenant_id NULL
-- invisibles por defecto (fail-secure) — correcto para cualquiera que
-- NO sea de plataforma, pero un operador de plataforma necesita verse a
-- sí mismo y a sus pares. Un operador de tenant normal sigue sin verlos
-- (is_platform_operator() da FALSE para ellos).

DROP POLICY IF EXISTS operators_tenant_access ON operations.operators;
CREATE POLICY operators_tenant_access ON operations.operators
  USING (
    core.has_tenant_access(tenant_id)
    OR (tenant_id IS NULL AND core.is_platform_operator())
  );

DROP POLICY IF EXISTS operator_roles_tenant_access ON operations.operator_roles;
CREATE POLICY operator_roles_tenant_access ON operations.operator_roles
  USING (
    core.has_tenant_access(tenant_id)
    OR (tenant_id IS NULL AND core.is_platform_operator())
  );

DROP POLICY IF EXISTS operator_presence_tenant_access ON operations.operator_presence;
CREATE POLICY operator_presence_tenant_access ON operations.operator_presence
  USING (
    core.has_tenant_access(tenant_id)
    OR (tenant_id IS NULL AND core.is_platform_operator())
  );

-- Rol de plataforma con permiso de configuración — sin operador
-- todavía: crear el primer Superadmin real es un paso manual de
-- bootstrap (INSERT en operations.operators con este role_id y el
-- user_id de quien corresponda), no algo que se pueda automatizar sin
-- saber quién es.
INSERT INTO operations.operator_roles (tenant_id, code, name_es, name_en, level, can_manage_config, can_manage_operators, can_view_reports)
SELECT NULL, 'PLATFORM_SUPERADMIN', 'Superadmin de plataforma', 'Platform superadmin', 100, TRUE, TRUE, TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM operations.operator_roles WHERE tenant_id IS NULL AND code = 'PLATFORM_SUPERADMIN'
);


-- ── params.smtp_settings ───────────────────────────────────────
-- Configuración editable solo por Superadmin (core.has_platform_config_access).
-- password_encrypted usa core.encrypt_pii, igual que el email de los
-- usuarios — nunca en texto plano, ni siquiera para quien tiene acceso
-- de config (se desencripta solo al armar la conexión SMTP real).

CREATE TABLE IF NOT EXISTS params.smtp_settings (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  host                TEXT        NOT NULL,
  port                INTEGER     NOT NULL,
  username            TEXT        NOT NULL,
  password_encrypted  BYTEA       NOT NULL,
  from_address        TEXT        NOT NULL,
  from_name           TEXT        NOT NULL DEFAULT 'MedTravelApp',
  secure              BOOLEAN     NOT NULL DEFAULT TRUE,
  active              BOOLEAN     NOT NULL DEFAULT TRUE,
  updated_by          UUID        NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_smtp_settings_upd
  BEFORE UPDATE ON params.smtp_settings
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

ALTER TABLE params.smtp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE params.smtp_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY smtp_settings_config_access ON params.smtp_settings
  USING (core.has_platform_config_access())
  WITH CHECK (core.has_platform_config_access());

GRANT SELECT, INSERT, UPDATE ON params.smtp_settings TO app_runtime;

-- ── params.get_active_smtp_config ──────────────────────────────
-- MailService necesita poder armar el transporter SMTP sin importar
-- quién dispara el envío (ej. un member pidiendo reset de password no
-- tiene ni debería tener core.has_platform_config_access()) — por eso
-- esta función puntual, no una relajación de la RLS de la tabla. Nunca
-- se expone tal cual por HTTP: MailService la usa solo internamente
-- para construir la conexión SMTP, jamás para responder al cliente.
CREATE OR REPLACE FUNCTION params.get_active_smtp_config()
RETURNS TABLE (
  host         TEXT,
  port         INTEGER,
  username     TEXT,
  password     TEXT,
  from_address TEXT,
  from_name    TEXT,
  secure       BOOLEAN
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, params, core AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.host, s.port, s.username, core.decrypt_pii(s.password_encrypted),
    s.from_address, s.from_name, s.secure
  FROM params.smtp_settings s
  WHERE s.active = TRUE
  ORDER BY s.updated_at DESC
  LIMIT 1;
END;
$$;
REVOKE EXECUTE ON FUNCTION params.get_active_smtp_config() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION params.get_active_smtp_config()
  TO app_runtime, test_runner;
