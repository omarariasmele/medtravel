-- ============================================================
-- Gap encontrado en el diálogo de edición de "Operadores": permite
-- cambiar rol/tipo/estado/nombre (columnas propias de
-- operations.operators), pero no el email de login — porque el email
-- vive en core.users (otro esquema/tabla), cifrado (core.encrypt_pii)
-- con blind index para el UNIQUE. core.users tiene RLS forzada sin
-- ninguna política propia (mismo motivo que core.register_person_and_user:
-- solo se toca vía función SECURITY DEFINER puntual, nunca por CRUD
-- genérico ni por acceso directo a la tabla).
--
-- Diseño de permisos: estas funciones NO repiten el chequeo de tenant
-- — el controller ya lo hace antes de llamarlas, leyendo
-- operations.operators con la conexión normal (RLS forzada,
-- operators_tenant_access ya exige own-tenant o can_manage_config)
-- para confirmar que el operator_id es visible/editable por quien
-- llama, y solo entonces pasa su user_id a estas funciones.
-- ============================================================

CREATE OR REPLACE FUNCTION core.get_user_email(p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
DECLARE v_email TEXT;
BEGIN
  SELECT core.decrypt_pii(email) INTO v_email
  FROM core.users WHERE id = p_user_id;
  RETURN v_email;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.get_user_email(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.get_user_email(UUID)
  TO app_runtime, test_runner;

CREATE OR REPLACE FUNCTION core.update_user_email(
  p_user_id            UUID,
  p_email              TEXT,
  p_email_blind_index  TEXT
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
BEGIN
  UPDATE core.users
  SET email = core.encrypt_pii(p_email),
      email_blind_index = p_email_blind_index,
      email_verified = FALSE
  WHERE id = p_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.update_user_email(UUID,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.update_user_email(UUID,TEXT,TEXT)
  TO app_runtime, test_runner;
