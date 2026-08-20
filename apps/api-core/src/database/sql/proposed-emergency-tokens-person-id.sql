-- ============================================================
-- Gap #35: emergency.tokens/access_log exigían member_id NOT NULL —
-- un viajero "sin cobertura" (sin core.members, ver gap #32) no podía
-- generar NINGÚN QR/link de emergencia ni invitación a médico, porque
-- MeEmergencyController.generateQr / MeSharesController.createDoctorInvite
-- llamaban resolveMemberId(), que tira 404 si no hay member. Mismo
-- patrón ya usado para coverage.health_coverages (gap #27) y
-- core.get_travelers_without_tenant: agregar person_id como alternativa
-- a member_id, nunca sacar member_id (sigue siendo el dato correcto
-- para viajeros con cobertura real).
-- No se toca el baseline 000-009; aplicar como patch adicional.
-- ============================================================

ALTER TABLE emergency.tokens
  ALTER COLUMN member_id DROP NOT NULL,
  ADD COLUMN person_id UUID REFERENCES core.persons(id);

ALTER TABLE emergency.tokens
  ADD CONSTRAINT tokens_owner_chk CHECK (member_id IS NOT NULL OR person_id IS NOT NULL);

ALTER TABLE emergency.access_log
  ALTER COLUMN member_id DROP NOT NULL,
  ADD COLUMN person_id UUID REFERENCES core.persons(id);

ALTER TABLE emergency.access_log
  ADD CONSTRAINT access_log_owner_chk CHECK (member_id IS NOT NULL OR person_id IS NOT NULL);

-- ── emergency.redeem_share_token(): derivar person_id de member_id
-- cuando existe, o usar el person_id propio del token directamente ──
CREATE OR REPLACE FUNCTION emergency.redeem_share_token(
  p_token_value        TEXT,
  p_access_method_code TEXT,
  p_ip                 TEXT DEFAULT NULL
)
RETURNS TABLE (
  ok              BOOLEAN,
  share_token_id  UUID,
  member_id       UUID,
  person_id       UUID,
  scope           TEXT[],
  expires_at      TIMESTAMPTZ,
  can_submit_note BOOLEAN
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
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID, NULL::UUID, NULL::TEXT[], NULL::TIMESTAMPTZ, FALSE;
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
    RETURN QUERY SELECT FALSE, v_token.id, NULL::UUID, NULL::UUID, NULL::TEXT[], NULL::TIMESTAMPTZ, FALSE;
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
    ('submit_note' = ANY(v_token.scope));
END;
$$;
REVOKE EXECUTE ON FUNCTION emergency.redeem_share_token(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION emergency.redeem_share_token(TEXT, TEXT, TEXT)
  TO app_runtime, test_runner;

-- ── emergency.submit_anonymous_share_note(): mismo criterio ──
CREATE OR REPLACE FUNCTION emergency.submit_anonymous_share_note(
  p_token_value          TEXT,
  p_accessor_name        TEXT,
  p_accessor_email       TEXT,
  p_accessor_specialty   TEXT,
  p_accessor_institution TEXT,
  p_recommendations      TEXT,
  p_treatment            TEXT,
  p_notes                TEXT,
  p_ip                   TEXT DEFAULT NULL
)
RETURNS TABLE (ok BOOLEAN, draft_id UUID, claim_token_value TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, emergency, clinical, core, params, public AS $$
DECLARE
  v_token       emergency.tokens%ROWTYPE;
  v_person      UUID;
  v_ip          INET;
  v_claim_value TEXT;
  v_claim_hash  TEXT;
  v_draft       UUID;
BEGIN
  BEGIN
    v_ip := NULLIF(p_ip, '')::INET;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  SELECT * INTO v_token FROM emergency.tokens WHERE token_value = p_token_value;

  IF NOT FOUND
     OR v_token.expires_at < NOW()
     OR v_token.status_id NOT IN (
          params.catalog_id('TOKEN_STATUS', 'ACTIVE'),
          params.catalog_id('TOKEN_STATUS', 'USED')
        )
     OR NOT ('submit_note' = ANY(v_token.scope))
  THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::TEXT;
    RETURN;
  END IF;

  IF v_token.member_id IS NOT NULL THEN
    SELECT m.person_id INTO v_person FROM core.members m WHERE m.id = v_token.member_id;
  ELSE
    v_person := v_token.person_id;
  END IF;

  v_claim_value := translate(encode(gen_random_bytes(24), 'base64'), '/+=', '_-');
  v_claim_hash  := encode(digest(v_claim_value, 'sha256'), 'hex');

  INSERT INTO emergency.share_note_drafts
    (token_id, person_id, member_id, claim_token_hash,
     accessor_name, accessor_email, accessor_specialty, accessor_institution,
     recommendations, treatment, notes, claim_status_id)
  VALUES
    (v_token.id, v_person, v_token.member_id, v_claim_hash,
     p_accessor_name, p_accessor_email, p_accessor_specialty, p_accessor_institution,
     p_recommendations, p_treatment, p_notes,
     params.catalog_id('SHARE_NOTE_CLAIM_STATUS', 'UNCLAIMED'))
  RETURNING id INTO v_draft;

  INSERT INTO emergency.access_log
    (token_id, member_id, person_id, accessor_type_id, accessor_name, accessor_email, accessor_specialty,
     access_ip, access_method_id, doctor_left_note, access_granted)
  VALUES
    (v_token.id, v_token.member_id, v_person, params.catalog_id('ACCESSOR_TYPE', 'DOCTOR'),
     p_accessor_name, p_accessor_email, p_accessor_specialty,
     v_ip, params.catalog_id('ACCESS_METHOD', 'LINK_CLICK'), TRUE, TRUE);

  RETURN QUERY SELECT TRUE, v_draft, v_claim_value;
END;
$$;
REVOKE EXECUTE ON FUNCTION emergency.submit_anonymous_share_note(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION emergency.submit_anonymous_share_note(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT)
  TO app_runtime, test_runner;
