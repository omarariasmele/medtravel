-- ============================================================
-- Gap #48: core.persons.country_residence_id nunca se seteaba en el
-- alta (core.register_person_and_user, proposed-registration.sql) ni
-- tenía ningún valor de respaldo — quedaba NULL siempre, mostrando
-- "—" en País para el 100% de los viajeros (Usuarios y Usuarios sin
-- cobertura).
--
-- Dos partes:
-- (1) BACKFILL de las 20 personas ya existentes con
--     country_residence_id NULL → Argentina. Corrección puntual de
--     datos porque hoy, de hecho, todos los viajeros cargados son de
--     Argentina — no es un default de sistema.
-- (2) De acá en más, el alta toma el país que el propio usuario ya
--     elige en el formulario de registro ("País emisor" del
--     documento, docCountryId — mismo valor que ya manda el cliente,
--     no un campo nuevo) — NO se hardcodea Argentina para altas
--     futuras, pedido explícito del usuario tras ver el punto (1):
--     cada viajero puede ser de cualquier país.
-- ============================================================

CREATE OR REPLACE FUNCTION core.register_person_and_user(
  p_first_name      TEXT,
  p_last_name       TEXT,
  p_email           TEXT,
  p_email_blind_index TEXT,
  p_password_hash   TEXT,
  p_country_id      UUID,
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

  INSERT INTO core.persons (first_name, last_name, preferred_lang, country_residence_id)
  VALUES (
    core.encrypt_pii(p_first_name), core.encrypt_pii(p_last_name), p_preferred_lang,
    p_country_id
  )
  RETURNING id INTO v_person_id;

  INSERT INTO core.users (person_id, email, email_blind_index, preferred_lang)
  VALUES (v_person_id, core.encrypt_pii(p_email), p_email_blind_index, p_preferred_lang)
  RETURNING id INTO v_user_id;

  INSERT INTO core.authentication_credentials (user_id, password_hash)
  VALUES (v_user_id, p_password_hash);

  RETURN QUERY SELECT v_person_id, v_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.register_person_and_user(TEXT,TEXT,TEXT,TEXT,TEXT,UUID,CHAR(5)) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.register_person_and_user(TEXT,TEXT,TEXT,TEXT,TEXT,UUID,CHAR(5))
  TO app_runtime, test_runner;

-- Firma vieja (sin p_country_id) ya no se usa — el controller pasa
-- siempre el país ahora. Se elimina para no dejar dos overloads
-- ambiguos con similar cantidad de parámetros por defecto.
DROP FUNCTION IF EXISTS core.register_person_and_user(TEXT,TEXT,TEXT,TEXT,TEXT,CHAR(5));

UPDATE core.persons
SET country_residence_id = params.catalog_id('COUNTRY', 'AR')
WHERE country_residence_id IS NULL;
