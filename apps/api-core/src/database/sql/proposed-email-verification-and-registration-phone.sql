-- ============================================================
-- Pedido explícito del usuario: "cuando un usuario se da de alta no
-- esta validando el mail, eso es importante porque el mail es la forma
-- de comunicacion directa con los usuarios. Se tiene que validar." +
-- "en el registro del usuario no veo donde se ingresa el numero de
-- celular".
--
-- 1. Verificación de email por código de 6 dígitos (no un link — la app
--    del viajero es mobile-only, sin página web pública donde aterrizar
--    un link de verificación, a diferencia de reset de password que sí
--    tiene /reset-password en admin-web). Mismo patrón que
--    core.password_reset_tokens (proposed-password-reset-and-smtp.sql),
--    con code_hash en vez de token_hash.
-- 2. core.users.phone/phone_blind_index YA existían en el schema
--    (003_core_identity.sql) pero NADA los escribía en ningún lado de
--    la app — ni el registro, ni ninguna pantalla de perfil. Se agrega
--    acá al registro; una pantalla de edición posterior queda fuera de
--    alcance de este pedido puntual.
-- ============================================================

CREATE TABLE IF NOT EXISTS core.email_verification_codes (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES core.users(id),
  code_hash   TEXT         NOT NULL,
  expires_at  TIMESTAMPTZ  NOT NULL,
  used        BOOLEAN      NOT NULL DEFAULT FALSE,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Mismo hardening que password_reset_tokens_self (gap de diseño
-- original): tabla sensible con RLS de dueño, aunque nunca se expone
-- por CRUD genérico.
ALTER TABLE core.email_verification_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS email_verification_codes_self ON core.email_verification_codes;
CREATE POLICY email_verification_codes_self ON core.email_verification_codes
  USING (user_id = app.current_uuid('app.current_user_id'));

GRANT SELECT, INSERT, UPDATE ON core.email_verification_codes TO app_runtime, test_runner;

-- SECURITY DEFINER: el UPDATE a core.users.email_verified no tiene
-- ninguna policy que lo permita desde una sesión normal (mismo motivo
-- que core.consume_password_reset_token) — atómico en un solo statement
-- para que dos intentos concurrentes con el mismo código no lo usen dos veces.
CREATE OR REPLACE FUNCTION core.consume_email_verification_code(
  p_user_id UUID,
  p_code_hash TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
DECLARE v_found UUID;
BEGIN
  UPDATE core.email_verification_codes
  SET used = TRUE, used_at = NOW()
  WHERE user_id = p_user_id AND code_hash = p_code_hash
    AND used = FALSE AND expires_at > NOW()
  RETURNING id INTO v_found;

  IF v_found IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE core.users SET email_verified = TRUE WHERE id = p_user_id;
  RETURN TRUE;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.consume_email_verification_code(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.consume_email_verification_code(UUID, TEXT)
  TO app_runtime, test_runner;

INSERT INTO params.operational_limits (tenant_id, limit_key, limit_value, unit, description_es, requires_approval, lifecycle_status)
SELECT NULL, 'EMAIL_VERIFICATION_CODE_TTL_MINUTES', 30, 'minutes',
  'Vigencia del código de verificación de email enviado al registrarse', FALSE, 'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM params.operational_limits
  WHERE limit_key = 'EMAIL_VERIFICATION_CODE_TTL_MINUTES' AND tenant_id IS NULL
);

-- Grandfather de cuentas ya activas: no hay forma retroactiva de
-- "verificar" el email de alguien que ya viene usando la cuenta con
-- normalidad (incluye a cualquiera probando la app ahora mismo) — la
-- exigencia nueva aplica solo hacia adelante, para altas nuevas.
UPDATE core.users SET email_verified = TRUE WHERE email_verified = FALSE;

-- core.register_person_and_user: agrega p_phone/p_phone_blind_index
-- opcionales al final. CREATE OR REPLACE con más parámetros crea un
-- OVERLOAD nuevo en vez de reemplazar la firma vieja (mismo problema ya
-- documentado en gap #53/proposed-trip-destinations-and-case-location.sql)
-- — hay que borrar la firma vieja de 7 parámetros explícitamente.
DROP FUNCTION IF EXISTS core.register_person_and_user(TEXT,TEXT,TEXT,TEXT,TEXT,UUID,CHAR(5));

CREATE OR REPLACE FUNCTION core.register_person_and_user(
  p_first_name        TEXT,
  p_last_name         TEXT,
  p_email             TEXT,
  p_email_blind_index TEXT,
  p_password_hash     TEXT,
  p_country_id        UUID,
  p_preferred_lang    CHAR(5) DEFAULT 'es',
  p_phone             TEXT DEFAULT NULL,
  p_phone_blind_index TEXT DEFAULT NULL
)
RETURNS TABLE (person_id UUID, user_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
DECLARE
  v_person_id UUID;
  v_user_id   UUID;
BEGIN
  IF NULLIF(TRIM(p_first_name), '') IS NULL OR NULLIF(TRIM(p_last_name), '') IS NULL THEN
    RAISE EXCEPTION 'register_person_and_user: nombre y apellido son obligatorios';
  END IF;

  INSERT INTO core.persons (first_name, last_name, preferred_lang, country_residence_id)
  VALUES (
    core.encrypt_pii(p_first_name), core.encrypt_pii(p_last_name), p_preferred_lang,
    p_country_id
  )
  RETURNING id INTO v_person_id;

  INSERT INTO core.users (person_id, email, email_blind_index, preferred_lang, phone, phone_blind_index)
  VALUES (
    v_person_id, core.encrypt_pii(p_email), p_email_blind_index, p_preferred_lang,
    CASE WHEN p_phone IS NOT NULL THEN core.encrypt_pii(p_phone) END,
    p_phone_blind_index
  )
  RETURNING id INTO v_user_id;

  INSERT INTO core.authentication_credentials (user_id, password_hash)
  VALUES (v_user_id, p_password_hash);

  RETURN QUERY SELECT v_person_id, v_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.register_person_and_user(TEXT,TEXT,TEXT,TEXT,TEXT,UUID,CHAR(5),TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.register_person_and_user(TEXT,TEXT,TEXT,TEXT,TEXT,UUID,CHAR(5),TEXT,TEXT)
  TO app_runtime, test_runner;

-- core.users tiene RLS FORCED sin NINGUNA policy propia (fail-secure a
-- propósito, ver 003_core_identity.sql) — todo acceso pasa por funciones
-- SECURITY DEFINER puntuales (get_user_phone, get_login_credentials,
-- etc.), nunca un SELECT directo desde el controller. Sin esto,
-- me-profile.controller.ts habría hecho un SELECT directo que RLS
-- bloquea EN SILENCIO (0 filas, no error) — mismo patrón de bug
-- encontrado repetidas veces esta sesión con otras tablas.
--
-- get_user_phone amplía su RETURNS TABLE con email_verified (mismo
-- viaje, mismo caller) — CREATE OR REPLACE no permite cambiar el tipo
-- de retorno de una función existente, hay que DROP primero.
DROP FUNCTION IF EXISTS core.get_user_phone(UUID);
CREATE OR REPLACE FUNCTION core.get_user_phone(p_user_id UUID)
RETURNS TABLE (phone TEXT, phone_verified BOOLEAN, email_verified BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
BEGIN
  RETURN QUERY
  SELECT core.decrypt_pii(u.phone), u.phone_verified, u.email_verified
  FROM core.users u
  WHERE u.id = p_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.get_user_phone(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.get_user_phone(UUID) TO app_runtime, test_runner;

-- Email propio por user_id (self-service, ej. reenviar el código de
-- verificación) — distinto de core.get_person_email_for_operator
-- (criterio de acceso de OPERADOR sobre un viajero ajeno, no aplica acá).
CREATE OR REPLACE FUNCTION core.get_user_email(p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
DECLARE v_email TEXT;
BEGIN
  SELECT core.decrypt_pii(email) INTO v_email FROM core.users WHERE id = p_user_id;
  RETURN v_email;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.get_user_email(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.get_user_email(UUID) TO app_runtime, test_runner;
