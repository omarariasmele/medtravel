-- ============================================================
-- Pedido explícito del usuario: la nota que deja el médico al entrar
-- por el link/QR de "Compartir mi Historial de Salud" quedaba SOLO en
-- clinical.encounters (el Historial de Salud de la persona) — nunca
-- visible para el operador dentro del caso de asistencia que la
-- originó, aunque el viajero tuviera un caso abierto en ese momento.
-- Confirmado con el usuario: se vincula automáticamente al caso
-- ABIERTO MÁS RECIENTE de esa persona (si tiene uno) — creando un
-- operations.case_medical_events con creates_clinical_record = TRUE,
-- ya que el encounter real se sigue creando en el mismo paso de
-- siempre. Si no hay ningún caso abierto, el comportamiento no
-- cambia: la nota queda solo en el Historial de Salud, como hasta
-- ahora.
-- ============================================================

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
     requires_member_confirmation, professional_license_snapshot, professional_trust_level_snapshot)
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
     v_trust_code)
  RETURNING id INTO v_submission;

  IF NOT v_certified THEN
    INSERT INTO clinical.record_review_tasks (submission_id, person_id, priority_id)
    VALUES (v_submission, v_draft.person_id, params.catalog_id('REVIEW_PRIORITY', 'NORMAL'));
  END IF;

  -- Caso abierto más reciente de esta persona (si tiene uno) — recién
  -- agregado, ver comentario de arriba.
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
REVOKE EXECUTE ON FUNCTION emergency.claim_share_note(TEXT, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION emergency.claim_share_note(TEXT, UUID)
  TO app_runtime, test_runner;
