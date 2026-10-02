-- ============================================================
-- Pedido explícito del usuario: un médico que ingresa a la plataforma
-- solo debe poder ver los centros médicos y las atenciones que ÉL
-- realizó (compartidas por QR/link) — nada más del sistema, y solo
-- durante la vigencia del link que usó para entrar. Pasado ese tiempo,
-- no debe poder ver nada más del paciente atendido.
--
-- 1) professional_view_expires_at en encounter_submissions: snapshot
--    de emergency.tokens.expires_at (el link ORIGINAL) al momento del
--    claim — no se recalcula después, así que sigue valiendo aunque el
--    token se borre/rote más adelante.
-- 2) emergency.claim_share_note() actualizada para completarlo.
-- 3) clinical.get_my_encounters(): el profesional resuelve su propia
--    identidad desde app.current_user_id (no recibe ningún id como
--    parámetro — no se puede pedir la lista de "otro" profesional) y
--    solo devuelve filas con professional_view_expires_at vigente.
-- ============================================================

ALTER TABLE clinical.encounter_submissions
  ADD COLUMN IF NOT EXISTS professional_view_expires_at TIMESTAMPTZ;

-- Backfill de lo ya existente (ej. Ignacio Martínez / Scervino) — se
-- puede reconstruir porque share_note_drafts.claimed_encounter_submission_id
-- ya apunta a la fila, y el draft conoce su token_id de origen.
UPDATE clinical.encounter_submissions es
SET professional_view_expires_at = t.expires_at
FROM emergency.share_note_drafts d
JOIN emergency.tokens t ON t.id = d.token_id
WHERE d.claimed_encounter_submission_id = es.id
  AND es.professional_view_expires_at IS NULL;

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
     CASE WHEN v_certified THEN params.catalog_id('CANONICAL_STATUS', 'IN_CANONICAL')
          ELSE params.catalog_id('CANONICAL_STATUS', 'PROVISIONAL') END,
     CASE WHEN v_certified THEN NULL
          ELSE params.catalog_id('CONFIRMATION_STATUS', 'PENDING') END,
     CASE WHEN v_certified THEN params.catalog_id('CERTIFICATION_STATUS', 'PROFESSIONALLY_CERTIFIED')
          ELSE params.catalog_id('CERTIFICATION_STATUS', 'UNCERTIFIED') END,
     NOT v_certified,
     v_prof.license_number,
     v_trust_code,
     v_token_expires_at)
  RETURNING id INTO v_submission;

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
      v_prof_name := v_prof.first_name || ' ' || v_prof.last_name;
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

-- Fase de acceso restringido del profesional: resuelve su propia
-- identidad desde la sesión (app.current_user_id), nunca recibe un id
-- ajeno como parámetro. Solo devuelve atenciones cuyo link de origen
-- sigue vigente — pasada esa fecha, la fila deja de aparecer.
CREATE OR REPLACE FUNCTION clinical.get_my_encounters()
RETURNS TABLE (
  encounter_id            UUID,
  encounter_date          DATE,
  submission_id           UUID,
  clinical_data           JSONB,
  confirmation_code       TEXT,
  certification_code      TEXT,
  professional_view_expires_at TIMESTAMPTZ,
  person_id               UUID,
  person_first_name       TEXT,
  person_last_name        TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, clinical, core, params AS $$
DECLARE
  v_prof_id UUID;
BEGIN
  SELECT id INTO v_prof_id FROM clinical.healthcare_professionals
    WHERE user_id = app.current_uuid('app.current_user_id');
  IF v_prof_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT e.id, e.encounter_date, es.id, es.clinical_data,
         conf_cv.code::TEXT, cert_cv.code::TEXT,
         es.professional_view_expires_at,
         p.id, core.decrypt_pii(p.first_name), core.decrypt_pii(p.last_name)
  FROM clinical.encounters e
  JOIN clinical.encounter_submissions es ON es.encounter_id = e.id AND es.deleted_at IS NULL
  JOIN core.persons p ON p.id = e.person_id
  LEFT JOIN params.catalog_values conf_cv ON conf_cv.id = es.confirmation_status_id
  LEFT JOIN params.catalog_values cert_cv ON cert_cv.id = es.certification_status_id
  WHERE e.professional_id = v_prof_id
    AND (es.professional_view_expires_at IS NULL OR es.professional_view_expires_at > NOW())
  ORDER BY e.created_at DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION clinical.get_my_encounters() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION clinical.get_my_encounters() TO app_runtime, test_runner;
