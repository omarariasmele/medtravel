-- ============================================================
-- Compartir historia clínica — Hito 2: registro/login del profesional
-- + certificación automática + reclamo de nota anónima.
--
-- Alta ampliada del profesional (pedido original del usuario): sexo,
-- provincia/estado, localidad, y datos impositivos si es institución
-- (CUIT). doc_number sigue siendo obligatorio (una institución igual
-- se da de alta a través de una persona real que la representa) — el
-- dato impositivo es ADICIONAL, no un reemplazo.
--
-- No se toca el baseline 000-009 aprobado; aplicar como patch adicional.
-- ============================================================

ALTER TABLE clinical.healthcare_professionals
  ADD COLUMN gender_id      UUID REFERENCES params.catalog_values(id),
  ADD COLUMN state_province TEXT,
  ADD COLUMN city           TEXT,
  ADD COLUMN is_institution BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN tax_id         BYTEA;

-- ── Catálogos que faltaban para poder crear encounters/submissions
-- reales (dominios ya existían vacíos desde 008_seeds.sql) ──────────
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
JOIN (VALUES
  ('GENDER', 'MALE',              'Masculino',        'Male',              1),
  ('GENDER', 'FEMALE',            'Femenino',         'Female',            2),
  ('GENDER', 'OTHER',             'Otro',             'Other',             3),
  ('GENDER', 'PREFER_NOT_TO_SAY', 'Prefiero no decir','Prefer not to say', 4),

  ('ENCOUNTER_TYPE', 'CONSULTATION', 'Consulta',        'Consultation', 1),
  ('ENCOUNTER_TYPE', 'EMERGENCY',    'Emergencia',      'Emergency',    2),
  ('ENCOUNTER_TYPE', 'FOLLOW_UP',    'Seguimiento',     'Follow-up',    3),
  ('ENCOUNTER_TYPE', 'TELEMEDICINE', 'Telemedicina',    'Telemedicine', 4),

  ('ENCOUNTER_STATUS', 'COMPLETED',   'Completado',  'Completed',   1),
  ('ENCOUNTER_STATUS', 'IN_PROGRESS', 'En curso',    'In progress', 2),
  ('ENCOUNTER_STATUS', 'CANCELLED',   'Cancelado',   'Cancelled',   3),

  ('SUBMISSION_TYPE', 'DIAGNOSIS',   'Diagnóstico',        'Diagnosis',    1),
  ('SUBMISSION_TYPE', 'TREATMENT',   'Tratamiento',        'Treatment',    2),
  ('SUBMISSION_TYPE', 'PRESCRIPTION','Prescripción',       'Prescription', 3),
  ('SUBMISSION_TYPE', 'NOTE',        'Nota de atención',   'Care note',    4),
  ('SUBMISSION_TYPE', 'LAB_RESULT',  'Resultado de laboratorio', 'Lab result', 5),

  ('REVIEW_PRIORITY', 'LOW',    'Baja',    'Low',    1),
  ('REVIEW_PRIORITY', 'NORMAL', 'Normal',  'Normal', 2),
  ('REVIEW_PRIORITY', 'HIGH',   'Alta',    'High',   3),
  ('REVIEW_PRIORITY', 'URGENT', 'Urgente', 'Urgent', 4),

  ('REVIEW_DECISION', 'APPROVED',          'Aprobada',                 'Approved',          1),
  ('REVIEW_DECISION', 'REJECTED',          'Rechazada',                'Rejected',          2),
  ('REVIEW_DECISION', 'NEEDS_MORE_INFO',   'Necesita más información', 'Needs more info',   3)
) AS v(domain_code, code, es, en, ord) ON dc.code = v.domain_code
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = dc.id AND cv.code = v.code
);

-- ── Reclamar una nota anónima ─────────────────────────────────
-- El médico dejó una nota sin registrarse (emergency.submit_anonymous_
-- share_note); ahora se registró o logueó y quiere que esa nota pase a
-- ser un encounter/encounter_submission real de su autoría. Certifica
-- solo si su trust_level ya es IDENTITY_VERIFIED o superior (umbral
-- explícito del usuario — nótese que es MÁS BAJO que el umbral de MFA
-- obligatorio, PROFESSIONAL_CERTIFIED, ver enforce_mfa_on_certification
-- en 006_professionals.sql: son dos escalones distintos a propósito).
-- Si no, queda PROVISIONAL + tarea de revisión (mismo patrón MTA-511 ya
-- validado en test.run_clinical_states()).
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
SET search_path = pg_catalog, emergency, clinical, core, params, public AS $$
DECLARE
  v_draft      emergency.share_note_drafts%ROWTYPE;
  v_prof       clinical.healthcare_professionals%ROWTYPE;
  v_trust_code TEXT;
  v_certified  BOOLEAN;
  v_encounter  UUID;
  v_submission UUID;
  v_hash       TEXT;
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
