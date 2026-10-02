-- ============================================================
-- Fase 3, parte B: consentimiento explícito al registrarse para que
-- un profesional de salud pueda cargar información clínica sobre el
-- viajero. core.member_data_consents (B2B, tenant/member) no sirve acá
-- — el registro es pre-auth y todavía no existe core.members en ese
-- momento (ver auth.service.ts:register). Tabla nueva, sin RLS (mismo
-- criterio que core.external_identifiers): solo la escribe
-- core.register_person_and_user (SECURITY DEFINER), se lee con GRANT
-- SELECT + WHERE person_id = $1 explícito en el controller.
-- ============================================================

CREATE TABLE IF NOT EXISTS core.person_consents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id             UUID NOT NULL REFERENCES core.persons(id),
  consent_code          VARCHAR(50) NOT NULL DEFAULT 'CLINICAL_DATA_BY_PROFESSIONAL',
  granted               BOOLEAN NOT NULL,
  granted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consent_text_version  VARCHAR(20) NOT NULL,
  withdrawal_at         TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT ON core.person_consents TO app_runtime;

-- core.register_person_and_user: agrega p_consent_accepted/
-- p_consent_text_version opcionales al final. Mismo patrón de DROP +
-- CREATE OR REPLACE ya usado en proposed-email-verification-and-
-- registration-phone.sql (un overload con más parámetros no reemplaza
-- la firma vieja).
DROP FUNCTION IF EXISTS core.register_person_and_user(TEXT,TEXT,TEXT,TEXT,TEXT,UUID,CHAR(5),TEXT,TEXT);

CREATE OR REPLACE FUNCTION core.register_person_and_user(
  p_first_name           TEXT,
  p_last_name            TEXT,
  p_email                TEXT,
  p_email_blind_index    TEXT,
  p_password_hash        TEXT,
  p_country_id           UUID,
  p_preferred_lang       CHAR(5) DEFAULT 'es',
  p_phone                TEXT DEFAULT NULL,
  p_phone_blind_index    TEXT DEFAULT NULL,
  p_consent_accepted     BOOLEAN DEFAULT NULL,
  p_consent_text_version TEXT DEFAULT NULL
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

  IF p_consent_accepted IS NOT NULL THEN
    INSERT INTO core.person_consents (person_id, granted, consent_text_version)
    VALUES (v_person_id, p_consent_accepted, COALESCE(p_consent_text_version, 'v1'));
  END IF;

  RETURN QUERY SELECT v_person_id, v_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.register_person_and_user(TEXT,TEXT,TEXT,TEXT,TEXT,UUID,CHAR(5),TEXT,TEXT,BOOLEAN,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.register_person_and_user(TEXT,TEXT,TEXT,TEXT,TEXT,UUID,CHAR(5),TEXT,TEXT,BOOLEAN,TEXT)
  TO app_runtime, test_runner;
