-- ============================================================
-- Paso 1 del brief (MedTravelApp_02_Brief_Claude_Code.docx): API mínima
-- de cara al viajero. Registro propio (self-service) — no existía
-- ningún camino para crear un core.persons/core.users nuevo: ambas
-- tablas tienen RLS forzada sin ninguna política que permita el INSERT
-- pre-auth (persons_self_access exige id = current_person_id, que no
-- existe todavía; core.users no tiene ninguna política en absoluto).
-- Mismo patrón que core.get_login_credentials/consume_password_reset_token:
-- una función SECURITY DEFINER puntual para esta única operación
-- controlada, no una relajación general de la RLS.
-- No se toca el baseline 000-009 aprobado; aplicar como patch adicional.
-- ============================================================

CREATE OR REPLACE FUNCTION core.register_person_and_user(
  p_first_name      TEXT,
  p_last_name       TEXT,
  p_email           TEXT,
  p_email_blind_index TEXT,
  p_password_hash   TEXT,
  p_preferred_lang  CHAR(5) DEFAULT 'es'
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

  INSERT INTO core.persons (first_name, last_name, preferred_lang)
  VALUES (p_first_name, p_last_name, p_preferred_lang)
  RETURNING id INTO v_person_id;

  INSERT INTO core.users (person_id, email, email_blind_index, preferred_lang)
  VALUES (v_person_id, core.encrypt_pii(p_email), p_email_blind_index, p_preferred_lang)
  RETURNING id INTO v_user_id;

  INSERT INTO core.authentication_credentials (user_id, password_hash)
  VALUES (v_user_id, p_password_hash);

  RETURN QUERY SELECT v_person_id, v_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.register_person_and_user(TEXT,TEXT,TEXT,TEXT,TEXT,CHAR(5)) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.register_person_and_user(TEXT,TEXT,TEXT,TEXT,TEXT,CHAR(5))
  TO app_runtime, test_runner;
