-- ============================================================
-- Bug real reportado en vivo: "al compartir la ficha medica, no me
-- esta validando el idioma que selecciono ya que todos los links la
-- veo en español" — la traducción SÍ se generaba y guardaba bien al
-- crear el link (translated_profile/translated_language quedaban
-- completos en emergency.tokens), pero public-shares.controller.ts::
-- read() la releía con un SELECT normal (RLS puesta), y la única
-- policy de SELECT de esa tabla (tokens_titular) exige
-- app.current_person_id/current_tenant_id — GUCs que NUNCA están
-- seteadas en el flujo público/anónimo del médico (solo se setean
-- app.emergency_token_active/emergency_token_person_id, que sirven
-- para otra cosa: las políticas de clinical.*). El SELECT devolvía
-- siempre 0 filas, silenciosamente, y el código caía al fallback en
-- español — de ahí que TODOS los links se vieran en español pese a
-- que la traducción sí existía en la base.
--
-- Fix: emergency.redeem_share_token() ya es SECURITY DEFINER y ya lee
-- la fila completa de emergency.tokens (v_token, bypassa RLS) para
-- validar el token — alcanza con devolver también translated_profile/
-- translated_language ahí, en vez de agregar una policy de RLS nueva
-- solo para este caso.
-- ============================================================

-- CREATE OR REPLACE no puede cambiar el shape de RETURNS TABLE (se
-- agregan 2 columnas) — hay que dropear la versión anterior primero.
DROP FUNCTION IF EXISTS emergency.redeem_share_token(TEXT, TEXT, TEXT);

CREATE FUNCTION emergency.redeem_share_token(
  p_token_value        TEXT,
  p_access_method_code TEXT,
  p_ip                 TEXT DEFAULT NULL
)
RETURNS TABLE (
  ok                 BOOLEAN,
  share_token_id     UUID,
  member_id          UUID,
  person_id          UUID,
  scope              TEXT[],
  expires_at         TIMESTAMPTZ,
  can_submit_note    BOOLEAN,
  translated_profile JSONB,
  translated_language TEXT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, emergency, clinical, core, params AS $$
DECLARE
  v_token  emergency.tokens%ROWTYPE;
  v_person UUID;
  v_ip     INET;
BEGIN
  BEGIN
    v_ip := NULLIF(p_ip, '')::INET;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  SELECT * INTO v_token FROM emergency.tokens WHERE token_value = p_token_value;

  IF NOT FOUND THEN
    INSERT INTO emergency.token_usage_log
      (token_id, token_value_attempted, check_token_exists, access_granted, denial_reason, attempt_ip)
    VALUES (NULL, p_token_value, FALSE, FALSE, 'not_found', v_ip);
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT[], NULL::TIMESTAMPTZ, FALSE, NULL::JSONB, NULL::TEXT;
    RETURN;
  END IF;

  IF v_token.member_id IS NOT NULL THEN
    SELECT m.person_id INTO v_person FROM core.members m WHERE m.id = v_token.member_id;
  ELSE
    v_person := v_token.person_id;
  END IF;

  IF v_token.status_id <> params.catalog_id('TOKEN_STATUS', 'ACTIVE')
     OR v_token.expires_at < NOW()
     OR (v_token.max_uses IS NOT NULL AND v_token.use_count >= v_token.max_uses)
  THEN
    INSERT INTO emergency.token_usage_log
      (token_id, token_value_attempted, check_token_exists, check_not_expired, check_not_revoked,
       access_granted, denial_reason, attempt_ip)
    VALUES (
      v_token.id, p_token_value, TRUE,
      v_token.expires_at >= NOW(),
      v_token.status_id = params.catalog_id('TOKEN_STATUS', 'ACTIVE'),
      FALSE, 'expired_or_revoked_or_exhausted', v_ip
    );
    RETURN QUERY SELECT FALSE, v_token.id, NULL::UUID, NULL::UUID, NULL::TEXT[], NULL::TIMESTAMPTZ, FALSE, NULL::JSONB, NULL::TEXT;
    RETURN;
  END IF;

  UPDATE emergency.tokens SET
    use_count = use_count + 1,
    status_id = CASE
      WHEN max_uses IS NOT NULL AND use_count + 1 >= max_uses
        THEN params.catalog_id('TOKEN_STATUS', 'USED')
      ELSE status_id
    END
  WHERE id = v_token.id;

  INSERT INTO emergency.access_log
    (token_id, member_id, person_id, accessor_type_id, access_ip, access_method_id, sections_viewed, access_granted)
  VALUES (
    v_token.id, v_token.member_id, v_person, params.catalog_id('ACCESSOR_TYPE', 'DOCTOR'),
    v_ip, params.catalog_id('ACCESS_METHOD', p_access_method_code), v_token.scope, TRUE
  );

  INSERT INTO emergency.token_usage_log
    (token_id, token_value_attempted, check_token_exists, check_not_expired, check_not_revoked,
     access_granted, attempt_ip)
  VALUES (v_token.id, p_token_value, TRUE, TRUE, TRUE, TRUE, v_ip);

  RETURN QUERY SELECT
    TRUE, v_token.id, v_token.member_id, v_person, v_token.scope, v_token.expires_at,
    ('submit_note' = ANY(v_token.scope)),
    v_token.translated_profile, v_token.translated_language::TEXT;
END;
$$;
REVOKE EXECUTE ON FUNCTION emergency.redeem_share_token(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION emergency.redeem_share_token(TEXT, TEXT, TEXT)
  TO app_runtime, test_runner;
