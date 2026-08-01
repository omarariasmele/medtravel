-- ============================================================
-- Gap encontrado: params.smtp_settings ya cifraba password_encrypted
-- (core.encrypt_pii) pero username quedó en texto plano — el usuario
-- pidió explícitamente que TODA credencial (usuarios y contraseñas)
-- esté cifrada en la base, no solo la contraseña. from_address/
-- from_name/host quedan sin cifrar a propósito: from_address es la
-- dirección que ve CUALQUIER destinatario en el header "De" de cada
-- mail que se envía, así que cifrarla en la base no protege nada (ya
-- es pública por diseño); host tampoco es un secreto (es solo la
-- dirección del servidor).
--
-- Migración segura: hay filas reales (username repetido en ~26 filas
-- de pruebas anteriores), así que se agrega columna nueva, se migra
-- con encrypt_pii, se borra la vieja y se renombra — mismo patrón que
-- proposed-clinical-encryption.sql.
-- ============================================================

ALTER TABLE params.smtp_settings ADD COLUMN username_enc BYTEA;

UPDATE params.smtp_settings SET username_enc = core.encrypt_pii(username);

ALTER TABLE params.smtp_settings ALTER COLUMN username_enc SET NOT NULL;
ALTER TABLE params.smtp_settings DROP COLUMN username;
ALTER TABLE params.smtp_settings RENAME COLUMN username_enc TO username;

-- params.get_active_smtp_config(): MailService lee de acá — hay que
-- desencriptar el username igual que ya se hacía con la contraseña.
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
    s.host, s.port, core.decrypt_pii(s.username), core.decrypt_pii(s.password_encrypted),
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
