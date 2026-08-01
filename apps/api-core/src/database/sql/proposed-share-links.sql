-- ============================================================
-- Compartir historia clínica con el médico tratante (QR/link) — Hito 1:
-- lectura acotada + nota anónima, sin registro del profesional todavía
-- (eso es Hito 2). Ver plan completo en vivid-scribbling-dawn.md.
--
-- Hallazgo clave: la RLS central (clinical.has_clinical_access,
-- 000_extensions.sql) YA tiene un camino #2 para esto — GUCs
-- app.emergency_token_active / app.emergency_token_person_id, y
-- RequestContextData ya los mapea (request-context.types.ts) — nunca se
-- usaron porque nunca existió un endpoint de redención de token. Este
-- archivo NO reimplementa el filtrado de historia clínica: la lectura de
-- alergias/condiciones/medicamentos sigue pasando por las mismas tablas
-- con RLS de siempre (clinical.allergies/conditions/medications), una
-- vez que el controller setea esas dos GUCs tras validar el token acá.
-- Solo hacen falta funciones nuevas para lo que SÍ es nuevo: validar+
-- loguear la redención del token, dar acceso a emergency_contacts (su
-- RLS es tenant/self, no has_clinical_access — necesita un puente
-- puntual como clinical.get_patient_summary), y guardar la nota anónima
-- del médico sin sesión (RLS normal de INSERT no aplica a un anónimo).
--
-- No se toca el baseline 000-009 aprobado; aplicar como patch adicional.
-- ============================================================

-- ── Dominio nuevo: estado de reclamo de nota anónima ─────────
INSERT INTO params.domain_catalogs (code, name_es, name_en, allows_tenant_override, is_ordered)
SELECT 'SHARE_NOTE_CLAIM_STATUS', 'Estado de reclamo de nota compartida', 'Share note claim status', FALSE, FALSE
WHERE NOT EXISTS (
  SELECT 1 FROM params.domain_catalogs WHERE code = 'SHARE_NOTE_CLAIM_STATUS'
);

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
JOIN (VALUES
  ('SHARE_NOTE_CLAIM_STATUS', 'UNCLAIMED', 'Sin reclamar', 'Unclaimed', 1),
  ('SHARE_NOTE_CLAIM_STATUS', 'CLAIMED',   'Reclamada',    'Claimed',   2)
) AS v(domain_code, code, es, en, ord) ON dc.code = v.domain_code
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = dc.id AND cv.code = v.code
);

-- ── Dominios existentes (008_seeds.sql) sin valores todavía ──
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
JOIN (VALUES
  ('RECIPIENT_TYPE', 'DOCTOR',      'Médico',                'Doctor',            1),
  ('RECIPIENT_TYPE', 'INSTITUTION', 'Institución médica',    'Institution',       2),
  ('RECIPIENT_TYPE', 'OTHER',       'Otro',                  'Other',             3),

  ('ACCESSOR_TYPE', 'DOCTOR',            'Médico',                 'Doctor',              1),
  ('ACCESSOR_TYPE', 'NURSE',             'Enfermero/a',            'Nurse',               2),
  ('ACCESSOR_TYPE', 'INSTITUTION_STAFF', 'Personal de institución','Institution staff',  3),
  ('ACCESSOR_TYPE', 'OTHER',             'Otro',                   'Other',               4),

  ('ACCESS_METHOD', 'QR_SCAN',    'Escaneo de QR',   'QR scan',    1),
  ('ACCESS_METHOD', 'LINK_CLICK', 'Click en link',   'Link click', 2)
) AS v(domain_code, code, es, en, ord) ON dc.code = v.domain_code
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = dc.id AND cv.code = v.code
);

-- ── Notas anónimas dejadas por un médico sin registro ────────
-- claim_token_hash: secreto propio (independiente del token de share)
-- que se le devuelve al médico para poder "reclamar" esta nota más
-- adelante si se registra/loguea (Hito 2) — no depende de matchear por
-- email, evita el problema de "el médico anotó un mail distinto".
CREATE TABLE emergency.share_note_drafts (
  id                               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id                         UUID         NOT NULL REFERENCES emergency.tokens(id),
  person_id                        UUID         NOT NULL REFERENCES core.persons(id),
  member_id                        UUID         REFERENCES core.members(id),
  claim_token_hash                 TEXT         NOT NULL UNIQUE,
  accessor_name                    TEXT,
  accessor_email                   TEXT,
  accessor_specialty               TEXT,
  accessor_institution             TEXT,
  recommendations                  TEXT,
  treatment                        TEXT,
  notes                            TEXT,
  claim_status_id                  UUID         NOT NULL REFERENCES params.catalog_values(id),
  claimed_by_professional_id       UUID         REFERENCES clinical.healthcare_professionals(id),
  claimed_encounter_submission_id  UUID         REFERENCES clinical.encounter_submissions(id),
  claimed_at                       TIMESTAMPTZ,
  created_at                       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_share_note_drafts_person ON emergency.share_note_drafts(person_id, created_at DESC);
CREATE INDEX idx_share_note_drafts_token  ON emergency.share_note_drafts(token_id);

-- RLS: mismo modelo de acceso que encounters/submissions — el titular,
-- un operador con caso/consentimiento, o el propio token de emergencia
-- activo (una vez que el controller setea esas GUCs tras redimir el
-- token). Sin GRANT de INSERT/UPDATE a app_runtime: la única escritura
-- válida es vía emergency.submit_anonymous_share_note (SECURITY
-- DEFINER más abajo), nunca un INSERT directo del anónimo.
ALTER TABLE emergency.share_note_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE emergency.share_note_drafts FORCE ROW LEVEL SECURITY;

CREATE POLICY share_note_drafts_access ON emergency.share_note_drafts
  USING (clinical.has_clinical_access(person_id));

GRANT SELECT ON emergency.share_note_drafts TO app_runtime;

-- ── Puente puntual para emergency_contacts ───────────────────
-- core.member_contacts RLS (contacts_member_access, 003_core_identity.sql)
-- es tenant/self, NO has_clinical_access — un médico anónimo con token
-- válido no entra por ninguna de las dos. Mismo patrón que
-- clinical.get_patient_summary: SECURITY DEFINER puntual que reutiliza
-- EXACTAMENTE el mismo chequeo, no una relajación general de la RLS.
CREATE OR REPLACE FUNCTION emergency.get_shared_contacts(p_person_id UUID)
RETURNS TABLE (
  first_name TEXT,
  last_name  TEXT,
  phone      TEXT,
  relationship_code TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, emergency, clinical, core, params AS $$
BEGIN
  IF NOT clinical.has_clinical_access(p_person_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT mc.first_name, mc.last_name,
         core.decrypt_pii(mc.phone),
         rt.code::TEXT
  FROM core.member_contacts mc
  JOIN core.members m ON m.id = mc.member_id
  LEFT JOIN params.catalog_values rt ON rt.id = mc.relationship_type_id
  WHERE m.person_id = p_person_id
    AND mc.is_emergency_contact = TRUE
    AND mc.active = TRUE
  ORDER BY mc.contact_priority;
END;
$$;
REVOKE EXECUTE ON FUNCTION emergency.get_shared_contacts(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION emergency.get_shared_contacts(UUID)
  TO app_runtime, test_runner;

-- ── Redimir token de share (lectura) ──────────────────────────
-- Valida vigencia/usos/estado, incrementa use_count, deja rastro en
-- access_log + token_usage_log (existían sin ningún writer). NO arma el
-- payload clínico acá — eso queda del lado NestJS reusando las tablas
-- con RLS normal, una vez que el controller setea
-- app.emergency_token_active/app.emergency_token_person_id con el
-- person_id que esta función devuelve (mismo mecanismo que ya
-- contemplaba has_clinical_access, camino #2, nunca conectado).
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

  SELECT m.person_id INTO v_person FROM core.members m WHERE m.id = v_token.member_id;

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
    (token_id, member_id, accessor_type_id, access_ip, access_method_id, sections_viewed, access_granted)
  VALUES (
    v_token.id, v_token.member_id, params.catalog_id('ACCESSOR_TYPE', 'DOCTOR'),
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

-- ── Nota anónima del médico (sin registro) ───────────────────
-- Requiere 'submit_note' en el scope del token (los tokens DYNAMIC_QR/
-- EMERGENCY_LINK de siempre no lo tienen — siguen funcionando igual que
-- hoy, solo lectura). Genera su propio claim_token_value/hash: el
-- médico se lo lleva para reclamar la nota después si se registra
-- (Hito 2, emergency.claim_share_note — todavía no existe).
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

  SELECT m.person_id INTO v_person FROM core.members m WHERE m.id = v_token.member_id;

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
    (token_id, member_id, accessor_type_id, accessor_name, accessor_email, accessor_specialty,
     access_ip, access_method_id, doctor_left_note, access_granted)
  VALUES
    (v_token.id, v_token.member_id, params.catalog_id('ACCESSOR_TYPE', 'DOCTOR'),
     p_accessor_name, p_accessor_email, p_accessor_specialty,
     v_ip, params.catalog_id('ACCESS_METHOD', 'LINK_CLICK'), TRUE, TRUE);

  RETURN QUERY SELECT TRUE, v_draft, v_claim_value;
END;
$$;
REVOKE EXECUTE ON FUNCTION emergency.submit_anonymous_share_note(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION emergency.submit_anonymous_share_note(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT)
  TO app_runtime, test_runner;
