-- ============================================================
-- Pedido explícito del usuario: si el médico detecta una enfermedad o
-- prescribe un medicamento/tratamiento, tiene que poder cargarlo como
-- tal (no solo como texto libre en la nota) para que quede reflejado
-- en el Historial de Salud real del viajero — con seguimiento. Mismo
-- criterio de pendiente/confirmado que ya rige encounter_submissions:
-- PROVENANCE_TYPE.PROFESSIONAL_ENTERED (ya existía en el catálogo,
-- nunca se usaba en ningún lado — es exactamente para esto),
-- confirmation_status_id = PENDING hasta que lo confirme el viajero O
-- la plataforma cuando el profesional se active (mismo trigger que ya
-- cascadea encounter_submissions, ampliado acá).
-- ============================================================

ALTER TABLE clinical.conditions
  ADD COLUMN IF NOT EXISTS source_encounter_submission_id UUID REFERENCES clinical.encounter_submissions(id);
ALTER TABLE clinical.medications
  ADD COLUMN IF NOT EXISTS source_encounter_submission_id UUID REFERENCES clinical.encounter_submissions(id);

ALTER TABLE emergency.share_note_drafts
  ADD COLUMN IF NOT EXISTS diagnosed_condition_name        TEXT,
  ADD COLUMN IF NOT EXISTS diagnosed_condition_icd10       VARCHAR(10),
  ADD COLUMN IF NOT EXISTS prescribed_medication_name      TEXT,
  ADD COLUMN IF NOT EXISTS prescribed_medication_dose      TEXT,
  ADD COLUMN IF NOT EXISTS prescribed_medication_frequency TEXT;

-- CREATE OR REPLACE con más parámetros crea un OVERLOAD nuevo en vez
-- de reemplazar la firma vieja de 9 args (mismo problema ya
-- documentado en gap #53 y en proposed-fase3-registration-consent.sql
-- para register_person_and_user) — sin este DROP, un llamado con 9
-- args queda AMBIGUO entre "la firma vieja" y "la nueva con defaults
-- para el resto", y Postgres lo rechaza (42725).
DROP FUNCTION IF EXISTS emergency.submit_anonymous_share_note(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT);

-- Bug real reportado en vivo: "no se pudo guardar la nota" —
-- share_note_drafts.person_id violaba NOT NULL. Al hacer CREATE OR
-- REPLACE con el cuerpo de proposed-share-links.sql (el original que
-- yo había leído) pisé sin darme cuenta una corrección POSTERIOR de
-- proposed-emergency-tokens-person-id.sql: un viajero sin
-- core.members (ej. alguien recién registrado, sin empresa) no tiene
-- member_id en el token, solo person_id directo — la resolución de
-- v_person tiene que contemplar los dos casos. Se restaura esa lógica
-- tal cual (incluye person_id en el INSERT a access_log, que tampoco
-- estaba en la versión vieja) y se le suman los 5 parámetros nuevos
-- con DEFAULT NULL.
CREATE OR REPLACE FUNCTION emergency.submit_anonymous_share_note(
  p_token_value          TEXT,
  p_accessor_name        TEXT,
  p_accessor_email       TEXT,
  p_accessor_specialty   TEXT,
  p_accessor_institution TEXT,
  p_recommendations      TEXT,
  p_treatment            TEXT,
  p_notes                TEXT,
  p_ip                   TEXT DEFAULT NULL,
  p_diagnosed_condition_name        TEXT DEFAULT NULL,
  p_diagnosed_condition_icd10       TEXT DEFAULT NULL,
  p_prescribed_medication_name      TEXT DEFAULT NULL,
  p_prescribed_medication_dose      TEXT DEFAULT NULL,
  p_prescribed_medication_frequency TEXT DEFAULT NULL
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
     recommendations, treatment, notes, claim_status_id,
     diagnosed_condition_name, diagnosed_condition_icd10,
     prescribed_medication_name, prescribed_medication_dose, prescribed_medication_frequency)
  VALUES
    (v_token.id, v_person, v_token.member_id, v_claim_hash,
     p_accessor_name, p_accessor_email, p_accessor_specialty, p_accessor_institution,
     p_recommendations, p_treatment, p_notes,
     params.catalog_id('SHARE_NOTE_CLAIM_STATUS', 'UNCLAIMED'),
     p_diagnosed_condition_name, p_diagnosed_condition_icd10,
     p_prescribed_medication_name, p_prescribed_medication_dose, p_prescribed_medication_frequency)
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

CREATE OR REPLACE FUNCTION emergency.claim_share_note(
  p_claim_token     TEXT,
  p_professional_id UUID
)
RETURNS TABLE (
  ok                      BOOLEAN,
  encounter_submission_id UUID,
  certified               BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, emergency, clinical, core, operations, params, public AS $$
DECLARE
  v_draft      emergency.share_note_drafts%ROWTYPE;
  v_prof       clinical.healthcare_professionals%ROWTYPE;
  v_trust_code TEXT;
  v_certified  BOOLEAN;
  v_encounter  UUID;
  v_submission UUID;
  v_hash       TEXT;
  v_case       operations.emergency_cases%ROWTYPE;
  v_prof_name  TEXT;
  v_token_expires_at TIMESTAMPTZ;
  v_canonical_status  UUID;
  v_confirmation_status UUID;
  v_certification_status UUID;
BEGIN
  v_hash := encode(digest(p_claim_token, 'sha256'), 'hex');

  SELECT * INTO v_draft FROM emergency.share_note_drafts WHERE claim_token_hash = v_hash;
  IF NOT FOUND OR v_draft.claim_status_id <> params.catalog_id('SHARE_NOTE_CLAIM_STATUS', 'UNCLAIMED') THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, FALSE;
    RETURN;
  END IF;

  SELECT * INTO v_prof FROM clinical.healthcare_professionals WHERE id = p_professional_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, FALSE;
    RETURN;
  END IF;

  SELECT expires_at INTO v_token_expires_at FROM emergency.tokens WHERE id = v_draft.token_id;

  SELECT cv.code INTO v_trust_code FROM params.catalog_values cv WHERE cv.id = v_prof.trust_level_id;
  v_certified := v_trust_code IN ('IDENTITY_VERIFIED', 'PROFESSIONAL_CERTIFIED', 'INSTITUTION_VERIFIED');

  v_canonical_status := CASE WHEN v_certified THEN params.catalog_id('CANONICAL_STATUS', 'IN_CANONICAL')
                             ELSE params.catalog_id('CANONICAL_STATUS', 'PROVISIONAL') END;
  v_confirmation_status := CASE WHEN v_certified THEN NULL
                                ELSE params.catalog_id('CONFIRMATION_STATUS', 'PENDING') END;
  v_certification_status := CASE WHEN v_certified THEN params.catalog_id('CERTIFICATION_STATUS', 'PROFESSIONALLY_CERTIFIED')
                                 ELSE params.catalog_id('CERTIFICATION_STATUS', 'UNCERTIFIED') END;

  INSERT INTO clinical.encounters
    (person_id, member_id, professional_id, encounter_date, encounter_type_id, notes, status_id)
  VALUES
    (v_draft.person_id, v_draft.member_id, p_professional_id, CURRENT_DATE,
     params.catalog_id('ENCOUNTER_TYPE', 'CONSULTATION'),
     v_draft.notes,
     params.catalog_id('ENCOUNTER_STATUS', 'COMPLETED'))
  RETURNING id INTO v_encounter;

  INSERT INTO clinical.encounter_submissions
    (encounter_id, person_id, member_id, professional_id, submission_type_id, clinical_data,
     canonical_status_id, confirmation_status_id, certification_status_id,
     requires_member_confirmation, professional_license_snapshot, professional_trust_level_snapshot,
     professional_view_expires_at)
  VALUES
    (v_encounter, v_draft.person_id, v_draft.member_id, p_professional_id,
     params.catalog_id('SUBMISSION_TYPE', 'NOTE'),
     jsonb_build_object(
       'recommendations', v_draft.recommendations,
       'treatment', v_draft.treatment,
       'notes', v_draft.notes
     ),
     v_canonical_status, v_confirmation_status, v_certification_status,
     NOT v_certified,
     v_prof.license_number,
     v_trust_code,
     v_token_expires_at)
  RETURNING id INTO v_submission;

  v_prof_name := v_prof.first_name || ' ' || v_prof.last_name;

  -- Pedido explícito del usuario: si el médico cargó un diagnóstico,
  -- que quede como condición real del Historial de Salud (no solo
  -- texto suelto) — mismo estado pendiente/certificado que la nota,
  -- vinculada a la misma submission para poder confirmarla/objetarla
  -- en un solo paso (ver MeClinicalController.confirmEncounter).
  IF v_draft.diagnosed_condition_name IS NOT NULL AND TRIM(v_draft.diagnosed_condition_name) <> '' THEN
    INSERT INTO clinical.conditions
      (person_id, member_id, icd10_code, condition_name, status_id,
       diagnosed_at, treating_doctor,
       canonical_status_id, confirmation_status_id, certification_status_id,
       requires_member_confirmation, provenance_id, source_encounter_submission_id)
    VALUES
      (v_draft.person_id, v_draft.member_id, v_draft.diagnosed_condition_icd10,
       core.encrypt_pii(v_draft.diagnosed_condition_name),
       params.catalog_id('CONDITION_STATUS', 'ACTIVE'),
       CURRENT_DATE, core.encrypt_pii(v_prof_name),
       v_canonical_status, v_confirmation_status, v_certification_status,
       NOT v_certified, params.catalog_id('PROVENANCE_TYPE', 'PROFESSIONAL_ENTERED'), v_submission);
  END IF;

  -- Ídem para la medicación prescripta.
  IF v_draft.prescribed_medication_name IS NOT NULL AND TRIM(v_draft.prescribed_medication_name) <> '' THEN
    INSERT INTO clinical.medications
      (person_id, member_id, generic_name, is_current, is_chronic,
       prescribed_by, prescribed_date, travel_notes,
       canonical_status_id, confirmation_status_id, certification_status_id,
       requires_member_confirmation, provenance_id, source_encounter_submission_id)
    VALUES
      (v_draft.person_id, v_draft.member_id, core.encrypt_pii(v_draft.prescribed_medication_name),
       TRUE, FALSE,
       core.encrypt_pii(v_prof_name), CURRENT_DATE,
       core.encrypt_pii(NULLIF(concat_ws(' ', v_draft.prescribed_medication_dose, v_draft.prescribed_medication_frequency), '')),
       v_canonical_status, v_confirmation_status, v_certification_status,
       NOT v_certified, params.catalog_id('PROVENANCE_TYPE', 'PROFESSIONAL_ENTERED'), v_submission);
  END IF;

  IF NOT v_certified THEN
    INSERT INTO clinical.record_review_tasks (submission_id, person_id, priority_id)
    VALUES (v_submission, v_draft.person_id, params.catalog_id('REVIEW_PRIORITY', 'NORMAL'));
  END IF;

  IF v_draft.member_id IS NOT NULL THEN
    SELECT * INTO v_case
    FROM operations.emergency_cases
    WHERE member_id = v_draft.member_id AND closed_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
      INSERT INTO operations.case_medical_events
        (case_id, member_id, event_type_id, description, performed_by,
         creates_clinical_record, registered_by_id, event_at)
      VALUES
        (v_case.id, v_draft.member_id, params.catalog_id('MEDICAL_EVENT_TYPE', 'GENERAL_NOTE'),
         concat_ws(E'\n',
           CASE WHEN v_draft.recommendations IS NOT NULL AND v_draft.recommendations <> ''
                THEN 'Recomendaciones: ' || v_draft.recommendations END,
           CASE WHEN v_draft.treatment IS NOT NULL AND v_draft.treatment <> ''
                THEN 'Tratamiento: ' || v_draft.treatment END,
           v_draft.notes
         ),
         v_prof_name, TRUE, p_professional_id, NOW());
    END IF;
  END IF;

  UPDATE emergency.share_note_drafts SET
    claim_status_id                 = params.catalog_id('SHARE_NOTE_CLAIM_STATUS', 'CLAIMED'),
    claimed_by_professional_id      = p_professional_id,
    claimed_encounter_submission_id = v_submission,
    claimed_at                      = NOW()
  WHERE id = v_draft.id;

  RETURN QUERY SELECT TRUE, v_submission, v_certified;
END;
$$;

-- Confirmar/objetar una atención cascadea a lo que haya generado en el
-- Historial de Salud (una sola acción del viajero, un solo resultado
-- coherente) — ver el mismo criterio ya usado para
-- confirmation_status_id en encounter_submissions.
CREATE OR REPLACE FUNCTION clinical.cascade_submission_confirmation(
  p_submission_id UUID,
  p_confirmed     BOOLEAN,
  p_challenge_notes TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, clinical, params AS $$
BEGIN
  IF p_confirmed THEN
    UPDATE clinical.conditions SET
      canonical_status_id = params.catalog_id('CANONICAL_STATUS', 'IN_CANONICAL'),
      confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS', 'MEMBER_CONFIRMED'),
      member_confirmed = TRUE, member_confirmed_at = NOW()
    WHERE source_encounter_submission_id = p_submission_id;

    UPDATE clinical.medications SET
      canonical_status_id = params.catalog_id('CANONICAL_STATUS', 'IN_CANONICAL'),
      confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS', 'MEMBER_CONFIRMED'),
      member_confirmed = TRUE, member_confirmed_at = NOW()
    WHERE source_encounter_submission_id = p_submission_id;
  ELSE
    UPDATE clinical.conditions SET
      member_challenged = TRUE, member_challenge_notes = core.encrypt_pii(p_challenge_notes),
      confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS', 'MEMBER_CHALLENGED')
    WHERE source_encounter_submission_id = p_submission_id;

    UPDATE clinical.medications SET
      member_challenged = TRUE, member_challenge_notes = core.encrypt_pii(p_challenge_notes),
      confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS', 'MEMBER_CHALLENGED')
    WHERE source_encounter_submission_id = p_submission_id;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION clinical.cascade_submission_confirmation(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION clinical.cascade_submission_confirmation(UUID, BOOLEAN, TEXT) TO app_runtime, test_runner;

-- Ampliación del trigger de activación de profesional (ver
-- proposed-platform-confirmation.sql): además de las submissions,
-- confirma en nombre de la plataforma las condiciones/medicamentos
-- que ese profesional cargó y seguían pendientes.
CREATE OR REPLACE FUNCTION clinical.cascade_platform_confirmation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, clinical, params AS $$
BEGIN
  IF NEW.is_active = TRUE AND (OLD.is_active IS DISTINCT FROM TRUE) THEN
    UPDATE clinical.encounter_submissions
    SET confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS', 'PLATFORM_CONFIRMED'),
        canonical_status_id    = params.catalog_id('CANONICAL_STATUS', 'IN_CANONICAL'),
        platform_reviewed_at   = NOW(),
        platform_reviewed_by   = app.current_uuid('app.current_user_id')
    WHERE professional_id = NEW.id
      AND confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS', 'PENDING');

    UPDATE clinical.conditions c SET
      confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS', 'PLATFORM_CONFIRMED'),
      canonical_status_id = params.catalog_id('CANONICAL_STATUS', 'IN_CANONICAL')
    FROM clinical.encounter_submissions es
    WHERE c.source_encounter_submission_id = es.id
      AND es.professional_id = NEW.id
      AND c.confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS', 'PENDING');

    UPDATE clinical.medications m SET
      confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS', 'PLATFORM_CONFIRMED'),
      canonical_status_id = params.catalog_id('CANONICAL_STATUS', 'IN_CANONICAL')
    FROM clinical.encounter_submissions es
    WHERE m.source_encounter_submission_id = es.id
      AND es.professional_id = NEW.id
      AND m.confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS', 'PENDING');
  END IF;
  RETURN NEW;
END;
$$;
