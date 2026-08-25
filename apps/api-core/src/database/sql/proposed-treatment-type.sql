-- ============================================================
-- Pedido explícito del usuario: "para el caso de diálisis, como la
-- tenemos que tratar ya que es un tratamiento, lo mismo pasaría con
-- quimioterapia u otro tipo de tratamiento de importancia" — diálisis
-- quedaba guardada como CONDITION (una enfermedad), pero es un
-- TRATAMIENTO — la enfermedad de fondo (ej. insuficiencia renal
-- crónica) ya se pregunta aparte. Mezclar ambos conceptos le resta
-- precisión justo al dato que más le importa a un médico de
-- emergencia (si dializa, si está inmunodeprimido por quimio, etc.).
--
-- Pedido explícito del usuario (mensaje siguiente): "para tratamientos
-- deberíamos tener también una tabla que pueda ser actualizada como
-- enfermedades, y que tenga el mismo tratamiento de altas o
-- modificaciones, si alguien informa algo que no está, se carga y
-- queda pendiente de verificación para que alguien responsable
-- confirme el alta" — clinical.treatments se modela CALCADO de
-- clinical.conditions (mismo status_id CONDITION_STATUS reutilizado —
-- ACTIVE/CHRONIC/RESOLVED/IN_REMISSION ya cubre "activo"/"pasado" sin
-- necesidad de un dominio nuevo, source_question_id para el mismo
-- chequeo anti-duplicado por pregunta). El "queda pendiente de
-- verificación" ya es gratis vía CatalogResolutionService.resolveOrCreate
-- ('TREATMENT_TYPE', ...) — el mismo mecanismo que ya usan
-- enfermedades/medicamentos/alergias/cirugías/implantes: si el nombre
-- libre no matchea un valor de catálogo existente, crea uno en DRAFT,
-- pendiente de que un admin lo revise en Catálogos, sin bloquear la
-- carga del dato en la ficha del viajero.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Dominio de catálogo TREATMENT_TYPE
-- ------------------------------------------------------------

INSERT INTO params.domain_catalogs (code, name_es, name_en, allows_tenant_override)
SELECT 'TREATMENT_TYPE', 'Tipos de tratamiento', 'Treatment types', FALSE
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs WHERE code = 'TREATMENT_TYPE');

WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'TREATMENT_TYPE')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM d, (VALUES
  ('DIALYSIS',             'Diálisis',                          'Dialysis',                          1),
  ('CHEMOTHERAPY',         'Quimioterapia',                     'Chemotherapy',                      2),
  ('RADIOTHERAPY',         'Radioterapia',                      'Radiotherapy',                      3),
  ('HOME_OXYGEN_THERAPY',  'Oxigenoterapia domiciliaria',       'Home oxygen therapy',              4),
  ('HOME_MECH_VENTILATION','Ventilación mecánica domiciliaria', 'Home mechanical ventilation',      5),
  ('PARENTERAL_NUTRITION', 'Nutrición parenteral',              'Parenteral nutrition',              6),
  ('IMMUNOSUPPRESSION',    'Tratamiento inmunosupresor',        'Immunosuppressive treatment',       7),
  ('ANTICOAGULATION_TX',   'Tratamiento anticoagulante',        'Anticoagulation treatment',         8),
  ('OTHER',                'Otro',                              'Other',                             9)
) AS v(code, es, en, ord)
WHERE NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code);

-- ------------------------------------------------------------
-- 2. clinical.treatments — calcado de clinical.conditions (mismo
--    status_id CONDITION_STATUS, mismo source_question_id, mismo
--    ciclo de vida altas/modificaciones/auditoría).
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clinical.treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES core.persons(id),
  member_id UUID REFERENCES core.members(id),
  treatment_name BYTEA NOT NULL,
  treatment_catalog_id UUID REFERENCES params.catalog_values(id),
  status_id UUID REFERENCES params.catalog_values(id),
  started_at DATE,
  notes BYTEA,
  canonical_status_id UUID NOT NULL REFERENCES params.catalog_values(id),
  confirmation_status_id UUID REFERENCES params.catalog_values(id),
  certification_status_id UUID REFERENCES params.catalog_values(id),
  member_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  member_confirmed_at TIMESTAMPTZ,
  member_challenged BOOLEAN NOT NULL DEFAULT FALSE,
  member_challenge_notes BYTEA,
  provenance_id UUID NOT NULL REFERENCES params.catalog_values(id),
  requires_member_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  source_question_id UUID REFERENCES ai.interview_questions(id),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  deletion_reason_id UUID REFERENCES params.catalog_values(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clinical.treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.treatments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinical_access ON clinical.treatments;
CREATE POLICY clinical_access ON clinical.treatments
  USING (clinical.has_clinical_access(person_id));

DROP POLICY IF EXISTS treatments_insert ON clinical.treatments;
CREATE POLICY treatments_insert ON clinical.treatments FOR INSERT TO app_runtime
  WITH CHECK (clinical.has_clinical_access(person_id));

DROP POLICY IF EXISTS treatments_update ON clinical.treatments;
CREATE POLICY treatments_update ON clinical.treatments FOR UPDATE TO app_runtime
  USING (clinical.has_clinical_access(person_id))
  WITH CHECK (clinical.has_clinical_access(person_id));

DROP POLICY IF EXISTS treatments_no_delete ON clinical.treatments;
CREATE POLICY treatments_no_delete ON clinical.treatments FOR DELETE TO app_runtime
  USING (FALSE);

CREATE TRIGGER trg_treatments_upd BEFORE UPDATE ON clinical.treatments
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

CREATE TRIGGER trg_treatments_immutable BEFORE UPDATE OF person_id, member_id ON clinical.treatments
  FOR EACH ROW EXECUTE FUNCTION clinical.deny_ownership_change();

CREATE TRIGGER audit_treatments AFTER INSERT OR DELETE OR UPDATE ON clinical.treatments
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();

CREATE TRIGGER trg_touch_health_record_treatments AFTER INSERT OR UPDATE OR DELETE ON clinical.treatments
  FOR EACH ROW EXECUTE FUNCTION core.touch_health_record_updated_at();

GRANT SELECT, INSERT, UPDATE ON clinical.treatments TO app_runtime, test_runner;

-- Mismo criterio que prevent_duplicate_condition (ver
-- proposed-prevent-duplicate-clinical-entries.sql): comparación EXACTA
-- de nombre, insensible a mayúsculas/espacios, solo entre filas
-- activas de la MISMA persona.
CREATE OR REPLACE FUNCTION clinical.prevent_duplicate_treatment()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, clinical, core AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM clinical.treatments t
    WHERE t.person_id = NEW.person_id
      AND t.active = TRUE
      AND t.deleted_at IS NULL
      AND t.id <> NEW.id
      AND lower(trim(core.decrypt_pii(t.treatment_name))) = lower(trim(core.decrypt_pii(NEW.treatment_name)))
  ) THEN
    RAISE EXCEPTION 'Ya tenés cargado el tratamiento "%"', core.decrypt_pii(NEW.treatment_name) USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_treatment ON clinical.treatments;
CREATE TRIGGER trg_prevent_duplicate_treatment
  BEFORE INSERT OR UPDATE OF treatment_name ON clinical.treatments
  FOR EACH ROW EXECUTE FUNCTION clinical.prevent_duplicate_treatment();

-- ------------------------------------------------------------
-- 3. ai.proposals / ai.interview_questions — el CHECK necesita
--    conocer el tipo nuevo (mismo gap que ya pasó con LAB_RESULT/
--    IMPLANT_DEVICE/OPEN_ENDED).
-- ------------------------------------------------------------

ALTER TABLE ai.proposals DROP CONSTRAINT IF EXISTS proposals_proposal_type_check;
ALTER TABLE ai.proposals ADD CONSTRAINT proposals_proposal_type_check
  CHECK (proposal_type::text = ANY (ARRAY[
    'MEDICATION', 'ALLERGY', 'CONDITION', 'SURGERY', 'VITALS', 'LAB_RESULT', 'IMPLANT_DEVICE', 'TREATMENT'
  ]::text[]));

ALTER TABLE ai.interview_questions DROP CONSTRAINT IF EXISTS interview_questions_proposal_type_check;
ALTER TABLE ai.interview_questions ADD CONSTRAINT interview_questions_proposal_type_check
  CHECK (proposal_type::text = ANY (ARRAY[
    'MEDICATION', 'ALLERGY', 'CONDITION', 'SURGERY', 'IMPLANT_DEVICE', 'OPEN_ENDED', 'TREATMENT'
  ]::text[]));

-- ------------------------------------------------------------
-- 4. DIALYSIS pasa de CONDITION a TREATMENT — mismo id/code, sin
--    perder el historial de respuestas ya cargadas contra esta
--    pregunta (source_question_id sigue apuntando acá).
-- ------------------------------------------------------------

UPDATE ai.interview_questions
SET proposal_type = 'TREATMENT', catalog_domain_code = 'TREATMENT_TYPE'
WHERE code = 'DIALYSIS';

-- ------------------------------------------------------------
-- 5. reset_health_record_admin / delete_test_traveler_admin también
--    tienen que vaciar clinical.treatments — mismo gap ya resuelto
--    antes para ai.* (ver proposed-health-record-reset-fix.sql). Se
--    reproduce el cuerpo COMPLETO y actual de reset_health_record_admin
--    (proposed-health-record-reset-fix.sql, ya aplicado) agregando
--    nada más que el bloque de clinical.treatments — nunca se toca
--    ai.* acá (ver comentario original: borraría el consumo de IA).
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION clinical.reset_health_record_admin(p_person_id UUID)
RETURNS TABLE (table_name TEXT, deleted_count INT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, clinical, ai, core AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM clinical.conditions WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'conditions'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.allergies WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'allergies'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.medications WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'medications'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.surgeries WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'surgeries'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.implants_devices WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'implants_devices'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.treatments WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'treatments'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.vitals_history WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'vitals_history'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.lab_results WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'lab_results'; deleted_count := v_count; RETURN NEXT;

  UPDATE core.persons SET health_record_last_updated_at = NULL WHERE id = p_person_id;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION clinical.reset_health_record_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinical.reset_health_record_admin(UUID) TO medtravel_app;

-- delete_test_traveler_admin reusa reset_health_record_admin (ver
-- proposed-delete-test-traveler.sql, FOR ... IN SELECT * FROM
-- clinical.reset_health_record_admin(...)) — clinical.treatments queda
-- cubierto transitivamente, sin tocar ese archivo.
