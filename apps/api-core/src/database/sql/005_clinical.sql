-- ============================================================
-- MedTravelApp — Schema SQL v1.2.3
-- 005_clinical.sql
-- CHANGELOG v1.2.3:
--   B3: RLS clínico — tenant NO accede al historial individual
--       solo por pertenencia al padrón. Requiere:
--       a) person_id propio (el titular), O
--       b) consentimiento activo en member_data_consents, O
--       c) caso de emergencia activo con modo ACTIVE_ON_OPEN_CASE
--   B4: FKs reales a params.catalog_values(id)
-- ============================================================

-- ── FUNCIÓN RLS CLÍNICA ───────────────────────────────────────
-- B3: Centraliza la lógica de acceso al historial
-- El tenant NO puede ver historial individual solo por tener al member
-- Requiere consentimiento explícito o caso activo autorizado
-- has_clinical_access: definida en 000_extensions.sql

CREATE TABLE clinical.allergies (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id                UUID         NOT NULL REFERENCES core.persons(id),
  member_id                UUID         REFERENCES core.members(id),
  allergen_name            TEXT         NOT NULL,
  allergen_type_id         UUID         NOT NULL REFERENCES params.catalog_values(id),
  allergen_snomed          VARCHAR(20),
  rxnorm_code              VARCHAR(20),
  reaction_type_id         UUID         REFERENCES params.catalog_values(id),
  severity_id              UUID         NOT NULL REFERENCES params.catalog_values(id),
  -- MTA-511: 3 campos de estado
  canonical_status_id      UUID         NOT NULL REFERENCES params.catalog_values(id),
  confirmation_status_id   UUID         REFERENCES params.catalog_values(id),
  certification_status_id  UUID         REFERENCES params.catalog_values(id),
  member_confirmed         BOOLEAN      NOT NULL DEFAULT FALSE,
  member_confirmed_at      TIMESTAMPTZ,
  member_challenged        BOOLEAN      NOT NULL DEFAULT FALSE,
  member_challenge_notes   TEXT,
  provenance_id            UUID         NOT NULL REFERENCES params.catalog_values(id),
  show_on_emergency        BOOLEAN      NOT NULL DEFAULT TRUE,
  requires_member_confirmation BOOLEAN  NOT NULL DEFAULT TRUE,
  -- C4: retención regulada
  deleted_at               TIMESTAMPTZ,
  deletion_reason_id       UUID         REFERENCES params.catalog_values(id),
  notes                    TEXT,
  active                   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── CONDICIONES ───────────────────────────────────────────────
CREATE TABLE clinical.conditions (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id                UUID         NOT NULL REFERENCES core.persons(id),
  member_id                UUID         REFERENCES core.members(id),
  icd10_code               VARCHAR(10),
  condition_name           TEXT         NOT NULL,
  condition_name_en        TEXT,
  status_id                UUID         NOT NULL REFERENCES params.catalog_values(id),
  travel_risk_id           UUID         REFERENCES params.catalog_values(id),
  diagnosed_at             DATE,
  resolved_at              DATE,
  treating_doctor          TEXT,
  treating_specialty       VARCHAR(100),
  treatment_notes          TEXT,
  travel_restrictions      TEXT,
  canonical_status_id      UUID         NOT NULL REFERENCES params.catalog_values(id),
  confirmation_status_id   UUID         REFERENCES params.catalog_values(id),
  certification_status_id  UUID         REFERENCES params.catalog_values(id),
  member_confirmed         BOOLEAN      NOT NULL DEFAULT FALSE,
  member_confirmed_at      TIMESTAMPTZ,
  member_challenged        BOOLEAN      NOT NULL DEFAULT FALSE,
  member_challenge_notes   TEXT,
  provenance_id            UUID         NOT NULL REFERENCES params.catalog_values(id),
  show_on_emergency        BOOLEAN      NOT NULL DEFAULT TRUE,
  requires_member_confirmation BOOLEAN  NOT NULL DEFAULT TRUE,
  deleted_at               TIMESTAMPTZ,
  deletion_reason_id       UUID         REFERENCES params.catalog_values(id),
  notes                    TEXT,
  active                   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── MEDICAMENTOS ──────────────────────────────────────────────
CREATE TABLE clinical.medications (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id                UUID         NOT NULL REFERENCES core.persons(id),
  member_id                UUID         REFERENCES core.members(id),
  rxnorm_code              VARCHAR(20),
  generic_name             TEXT         NOT NULL,
  brand_name               TEXT,
  brand_country_id         UUID         REFERENCES params.catalog_values(id),
  dose_amount              NUMERIC(8,2),
  dose_unit_id             UUID         REFERENCES params.catalog_values(id),
  dose_form_id             UUID         REFERENCES params.catalog_values(id),
  frequency_id             UUID         REFERENCES params.catalog_values(id),
  route_id                 UUID         REFERENCES params.catalog_values(id),
  with_food                BOOLEAN,
  time_of_day              TEXT[],
  prescribed_by            TEXT,
  prescribed_date          DATE,
  prescribed_country_id    UUID         REFERENCES params.catalog_values(id),
  condition_id             UUID         REFERENCES clinical.conditions(id),
  started_at               DATE,
  ended_at                 DATE,
  is_current               BOOLEAN      NOT NULL DEFAULT TRUE,
  is_chronic               BOOLEAN      NOT NULL DEFAULT FALSE,
  requires_cold_chain      BOOLEAN      NOT NULL DEFAULT FALSE,
  requires_certificate     BOOLEAN      NOT NULL DEFAULT FALSE,
  travel_notes             TEXT,
  canonical_status_id      UUID         NOT NULL REFERENCES params.catalog_values(id),
  confirmation_status_id   UUID         REFERENCES params.catalog_values(id),
  certification_status_id  UUID         REFERENCES params.catalog_values(id),
  member_confirmed         BOOLEAN      NOT NULL DEFAULT FALSE,
  member_confirmed_at      TIMESTAMPTZ,
  member_challenged        BOOLEAN      NOT NULL DEFAULT FALSE,
  member_challenge_notes   TEXT,
  provenance_id            UUID         NOT NULL REFERENCES params.catalog_values(id),
  ai_assisted              BOOLEAN      NOT NULL DEFAULT FALSE,
  ai_completed_fields      JSONB        NOT NULL DEFAULT '{}',
  requires_member_confirmation BOOLEAN  NOT NULL DEFAULT TRUE,
  deleted_at               TIMESTAMPTZ,
  deletion_reason_id       UUID         REFERENCES params.catalog_values(id),
  notes                    TEXT,
  active                   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── CIRUGÍAS ──────────────────────────────────────────────────
CREATE TABLE clinical.surgeries (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id                UUID         NOT NULL REFERENCES core.persons(id),
  member_id                UUID         REFERENCES core.members(id),
  procedure_name           TEXT         NOT NULL,
  procedure_name_en        TEXT,
  icd10_code               VARCHAR(10),
  snomed_code              VARCHAR(20),
  indication               TEXT,
  body_region              VARCHAR(100),
  approach_id              UUID         REFERENCES params.catalog_values(id),
  performed_at             DATE         NOT NULL,
  hospital_name            TEXT,
  hospital_country_id      UUID         REFERENCES params.catalog_values(id),
  surgeon_name             TEXT,
  surgeon_specialty        VARCHAR(100),
  outcome_id               UUID         REFERENCES params.catalog_values(id),
  complications            TEXT,
  recovery_notes           TEXT,
  has_implant              BOOLEAN      NOT NULL DEFAULT FALSE,
  implant_details          TEXT,
  implant_affects_imaging  BOOLEAN      NOT NULL DEFAULT FALSE,
  canonical_status_id      UUID         NOT NULL REFERENCES params.catalog_values(id),
  confirmation_status_id   UUID         REFERENCES params.catalog_values(id),
  certification_status_id  UUID         REFERENCES params.catalog_values(id),
  member_confirmed         BOOLEAN      NOT NULL DEFAULT FALSE,
  member_confirmed_at      TIMESTAMPTZ,
  member_challenged        BOOLEAN      NOT NULL DEFAULT FALSE,
  member_challenge_notes   TEXT,
  provenance_id            UUID         NOT NULL REFERENCES params.catalog_values(id),
  requires_member_confirmation BOOLEAN  NOT NULL DEFAULT TRUE,
  show_on_emergency        BOOLEAN      NOT NULL DEFAULT TRUE,
  deleted_at               TIMESTAMPTZ,
  deletion_reason_id       UUID         REFERENCES params.catalog_values(id),
  notes                    TEXT,
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── LABORATORIO ───────────────────────────────────────────────
CREATE TABLE clinical.lab_results (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id                UUID         NOT NULL REFERENCES core.persons(id),
  member_id                UUID         REFERENCES core.members(id),
  performed_at             DATE         NOT NULL,
  lab_name                 TEXT,
  requested_by             TEXT,
  country_id               UUID         REFERENCES params.catalog_values(id),
  -- Hemograma
  hemoglobin               NUMERIC(5,2),
  hematocrit               NUMERIC(5,2),
  white_blood_cells        NUMERIC(6,2),
  platelets                NUMERIC(7,0),
  neutrophils_pct          NUMERIC(5,2),
  lymphocytes_pct          NUMERIC(5,2),
  -- Glucemia y diabetes
  glucose_fasting          NUMERIC(6,2),
  glucose_postprand        NUMERIC(6,2),
  hba1c                    NUMERIC(4,2),
  -- Lípidos
  total_cholesterol        NUMERIC(6,2),
  hdl_cholesterol          NUMERIC(6,2),
  ldl_cholesterol          NUMERIC(6,2),
  triglycerides            NUMERIC(6,2),
  -- Función renal
  creatinine               NUMERIC(5,3),
  bun                      NUMERIC(6,2),
  uric_acid                NUMERIC(5,2),
  egfr                     NUMERIC(6,2),
  -- Función hepática
  alt                      NUMERIC(7,2),
  ast                      NUMERIC(7,2),
  ggt                      NUMERIC(7,2),
  total_bilirubin          NUMERIC(5,2),
  albumin                  NUMERIC(5,2),
  -- Tiroides
  tsh                      NUMERIC(7,4),
  t3_free                  NUMERIC(6,3),
  t4_free                  NUMERIC(6,3),
  -- Coagulación (crítico en anticoagulados)
  pt_inr                   NUMERIC(5,2),
  aptt                     NUMERIC(6,2),
  -- Electrolitos
  sodium                   NUMERIC(6,2),
  potassium                NUMERIC(5,2),
  calcium                  NUMERIC(5,2),
  -- Inflamación
  crp                      NUMERIC(7,3),
  ferritin                 NUMERIC(8,2),
  -- Vitaminas
  vitamin_d                NUMERIC(7,2),
  vitamin_b12              NUMERIC(7,2),
  -- Flexible
  custom_values            JSONB        NOT NULL DEFAULT '[]',
  -- IA
  ai_processed             BOOLEAN      NOT NULL DEFAULT FALSE,
  ai_processed_at          TIMESTAMPTZ,
  ai_alerts                JSONB        NOT NULL DEFAULT '[]',
  ai_summary_es            TEXT,
  ai_summary_en            TEXT,
  ai_risk_level_id         UUID         REFERENCES params.catalog_values(id),
  canonical_status_id      UUID         NOT NULL REFERENCES params.catalog_values(id),
  confirmation_status_id   UUID         REFERENCES params.catalog_values(id),
  certification_status_id  UUID         REFERENCES params.catalog_values(id),
  member_confirmed         BOOLEAN      NOT NULL DEFAULT FALSE,
  member_confirmed_at      TIMESTAMPTZ,
  member_challenged        BOOLEAN      NOT NULL DEFAULT FALSE,
  member_challenge_notes   TEXT,
  provenance_id            UUID         NOT NULL REFERENCES params.catalog_values(id),
  requires_member_confirmation BOOLEAN  NOT NULL DEFAULT TRUE,
  source_document_id       UUID,
  deleted_at               TIMESTAMPTZ,
  deletion_reason_id       UUID         REFERENCES params.catalog_values(id),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── SIGNOS VITALES ────────────────────────────────────────────
CREATE TABLE clinical.vitals_history (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         UUID         NOT NULL REFERENCES core.persons(id),
  member_id         UUID         REFERENCES core.members(id),
  weight_kg         NUMERIC(5,2),
  height_cm         NUMERIC(5,1),
  waist_cm          NUMERIC(5,1),
  bmi               NUMERIC(4,2) GENERATED ALWAYS AS (
    CASE WHEN weight_kg IS NOT NULL AND height_cm IS NOT NULL AND height_cm > 0
    THEN ROUND((weight_kg / ((height_cm/100.0) * (height_cm/100.0)))::NUMERIC, 2)
    ELSE NULL END
  ) STORED,
  blood_pressure_sys  SMALLINT,
  blood_pressure_dia  SMALLINT,
  heart_rate          SMALLINT,
  respiratory_rate    SMALLINT,
  temperature_c       NUMERIC(4,1),
  oxygen_saturation   NUMERIC(4,1),
  blood_glucose       NUMERIC(5,1),
  blood_type_id       UUID         REFERENCES params.catalog_values(id),
  measured_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  measured_by_id      UUID         REFERENCES params.catalog_values(id),
  context_id          UUID         REFERENCES params.catalog_values(id),
  device_used         TEXT,
  country_id          UUID         REFERENCES params.catalog_values(id),
  provenance_id       UUID         NOT NULL REFERENCES params.catalog_values(id),
  deleted_at          TIMESTAMPTZ,
  notes               TEXT,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── VACUNAS ───────────────────────────────────────────────────
CREATE TABLE clinical.vaccines (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id                UUID         NOT NULL REFERENCES core.persons(id),
  member_id                UUID         REFERENCES core.members(id),
  vaccine_name             TEXT         NOT NULL,
  vaccine_name_en          TEXT,
  cvx_code                 VARCHAR(10),
  manufacturer             TEXT,
  batch_number             TEXT,
  administered_at          DATE         NOT NULL,
  valid_until              DATE,
  administered_by          TEXT,
  institution              TEXT,
  country_id               UUID         REFERENCES params.catalog_values(id),
  certificate_number       TEXT,
  has_certificate          BOOLEAN      NOT NULL DEFAULT FALSE,
  required_for_travel      TEXT[],
  canonical_status_id      UUID         NOT NULL REFERENCES params.catalog_values(id),
  confirmation_status_id   UUID         REFERENCES params.catalog_values(id),
  certification_status_id  UUID         REFERENCES params.catalog_values(id),
  member_confirmed         BOOLEAN      NOT NULL DEFAULT FALSE,
  member_confirmed_at      TIMESTAMPTZ,
  member_challenged        BOOLEAN      NOT NULL DEFAULT FALSE,
  member_challenge_notes   TEXT,
  provenance_id            UUID         NOT NULL REFERENCES params.catalog_values(id),
  requires_member_confirmation BOOLEAN  NOT NULL DEFAULT TRUE,
  deleted_at               TIMESTAMPTZ,
  deletion_reason_id       UUID         REFERENCES params.catalog_values(id),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── DOCUMENTOS CLÍNICOS ───────────────────────────────────────
CREATE TABLE clinical.documents (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id                UUID         NOT NULL REFERENCES core.persons(id),
  member_id                UUID         REFERENCES core.members(id),
  document_type_id         UUID         NOT NULL REFERENCES params.catalog_values(id),
  file_name_original       TEXT         NOT NULL,
  file_name_storage        TEXT         NOT NULL,
  file_extension           VARCHAR(10)  NOT NULL,
  file_size_bytes          INTEGER      NOT NULL CHECK (file_size_bytes > 0),
  file_hash_sha256         TEXT         NOT NULL,
  mime_type                VARCHAR(100) NOT NULL,
  storage_path             TEXT         NOT NULL,
  is_encrypted             BOOLEAN      NOT NULL DEFAULT TRUE,
  encryption_key_ref       TEXT,
  title                    TEXT,
  description              TEXT,
  document_date            DATE,
  issuing_doctor           TEXT,
  issuing_institution      TEXT,
  country_id               UUID         REFERENCES params.catalog_values(id),
  language_original        CHAR(5),
  condition_id             UUID         REFERENCES clinical.conditions(id),
  surgery_id               UUID         REFERENCES clinical.surgeries(id),
  lab_result_id            UUID         REFERENCES clinical.lab_results(id),
  vaccine_id               UUID         REFERENCES clinical.vaccines(id),
  expires_at               DATE,
  expiry_notified          BOOLEAN      NOT NULL DEFAULT FALSE,
  show_on_emergency        BOOLEAN      NOT NULL DEFAULT FALSE,
  access_level_id          UUID         NOT NULL REFERENCES params.catalog_values(id),
  ai_processed             BOOLEAN      NOT NULL DEFAULT FALSE,
  ai_queued_at             TIMESTAMPTZ,
  ai_processed_at          TIMESTAMPTZ,
  canonical_status_id      UUID         NOT NULL REFERENCES params.catalog_values(id),
  confirmation_status_id   UUID         REFERENCES params.catalog_values(id),
  certification_status_id  UUID         REFERENCES params.catalog_values(id),
  member_confirmed         BOOLEAN      NOT NULL DEFAULT FALSE,
  member_confirmed_at      TIMESTAMPTZ,
  provenance_id            UUID         NOT NULL REFERENCES params.catalog_values(id),
  status_id                UUID         NOT NULL REFERENCES params.catalog_values(id),
  deleted_at               TIMESTAMPTZ,
  deletion_reason_id       UUID         REFERENCES params.catalog_values(id),
  archive_until            DATE,
  uploaded_by              UUID         NOT NULL,
  source_id                UUID         REFERENCES params.catalog_values(id),
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE clinical.document_ai_processing (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID         NOT NULL REFERENCES clinical.documents(id),
  person_id         UUID         NOT NULL REFERENCES core.persons(id),
  agent_type_id     UUID         NOT NULL REFERENCES params.catalog_values(id),
  agent_model       VARCHAR(50),
  status_id         UUID         NOT NULL REFERENCES params.catalog_values(id),
  queued_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  processing_ms     INTEGER,
  extracted_data    JSONB,
  extracted_text    TEXT,
  summary_es        TEXT,
  summary_en        TEXT,
  ai_observations   JSONB,
  confidence_score  NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
  quality_issues    TEXT[],
  tokens_input      INTEGER,
  tokens_output     INTEGER,
  -- B2: cost_usd eliminado — los costos de IA se gestionan externamente
  error_message     TEXT,
  retry_count       SMALLINT     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE clinical.document_shares (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id       UUID         NOT NULL REFERENCES clinical.documents(id),
  person_id         UUID         NOT NULL REFERENCES core.persons(id),
  share_token       TEXT         NOT NULL UNIQUE,
  share_url         TEXT         NOT NULL,
  shared_with_name  TEXT,
  shared_with_email TEXT,
  share_purpose     TEXT,
  -- B9: TTL leído de operational_limits, expires_at siempre NOT NULL
  expires_at        TIMESTAMPTZ  NOT NULL,
  max_accesses      SMALLINT     NOT NULL DEFAULT 3,
  access_count      SMALLINT     NOT NULL DEFAULT 0,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  revoked_at        TIMESTAMPTZ,
  revoked_by        UUID,
  notify_on_access  BOOLEAN      NOT NULL DEFAULT TRUE,
  last_accessed_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── ÍNDICES CLINICAL ──────────────────────────────────────────
-- índices por person_id (entidad raíz C1)
CREATE INDEX idx_allergies_person    ON clinical.allergies(person_id)
  WHERE active = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_allergies_emergency ON clinical.allergies(person_id, severity_id)
  WHERE show_on_emergency = TRUE AND active = TRUE;
CREATE INDEX idx_conditions_person   ON clinical.conditions(person_id)
  WHERE active = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_medications_current ON clinical.medications(person_id)
  WHERE is_current = TRUE AND active = TRUE AND deleted_at IS NULL;
CREATE INDEX idx_surgeries_person    ON clinical.surgeries(person_id)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_lab_person          ON clinical.lab_results(person_id, performed_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_vitals_person       ON clinical.vitals_history(person_id, measured_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_vaccines_person     ON clinical.vaccines(person_id, administered_at DESC)
  WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_person    ON clinical.documents(person_id, document_date DESC)
  WHERE deleted_at IS NULL;

-- índices por canonical_status para ficha de emergencia
CREATE INDEX idx_allergies_canonical    ON clinical.allergies(person_id, canonical_status_id);
CREATE INDEX idx_conditions_canonical   ON clinical.conditions(person_id, canonical_status_id);
CREATE INDEX idx_medications_canonical  ON clinical.medications(person_id, canonical_status_id);

-- ── RLS CLINICAL — B3: acceso basado en consentimiento ────────
ALTER TABLE clinical.allergies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.conditions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.medications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.surgeries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.lab_results    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.vitals_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.vaccines       ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.documents      ENABLE ROW LEVEL SECURITY;

-- B3: Política unificada para todas las tablas clínicas
-- El tenant SOLO puede acceder si tiene consentimiento activo o caso abierto
CREATE POLICY clinical_access ON clinical.allergies
  USING (clinical.has_clinical_access(person_id));
CREATE POLICY clinical_access ON clinical.conditions
  USING (clinical.has_clinical_access(person_id));
CREATE POLICY clinical_access ON clinical.medications
  USING (clinical.has_clinical_access(person_id));
CREATE POLICY clinical_access ON clinical.surgeries
  USING (clinical.has_clinical_access(person_id));
CREATE POLICY clinical_access ON clinical.lab_results
  USING (clinical.has_clinical_access(person_id));
CREATE POLICY clinical_access ON clinical.vitals_history
  USING (clinical.has_clinical_access(person_id));
CREATE POLICY clinical_access ON clinical.vaccines
  USING (clinical.has_clinical_access(person_id));
CREATE POLICY clinical_access ON clinical.documents
  USING (clinical.has_clinical_access(person_id));

-- ── TRIGGERS CLINICAL ─────────────────────────────────────────
CREATE TRIGGER trg_allergies_upd
  BEFORE UPDATE ON clinical.allergies FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_conditions_upd
  BEFORE UPDATE ON clinical.conditions FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_medications_upd
  BEFORE UPDATE ON clinical.medications FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_surgeries_upd
  BEFORE UPDATE ON clinical.surgeries FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_lab_results_upd
  BEFORE UPDATE ON clinical.lab_results FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_vaccines_upd
  BEFORE UPDATE ON clinical.vaccines FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_documents_upd
  BEFORE UPDATE ON clinical.documents FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- Audit triggers en tablas clínicas
CREATE TRIGGER audit_allergies
  AFTER INSERT OR UPDATE OR DELETE ON clinical.allergies
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();
CREATE TRIGGER audit_conditions
  AFTER INSERT OR UPDATE OR DELETE ON clinical.conditions
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();
CREATE TRIGGER audit_medications
  AFTER INSERT OR UPDATE OR DELETE ON clinical.medications
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();
CREATE TRIGGER audit_documents
  AFTER INSERT OR UPDATE OR DELETE ON clinical.documents
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();

-- ══════════════════════════════════════════════════════════════
-- B4/B5: ROLES Y FORCE RLS — clinical
-- ══════════════════════════════════════════════════════════════
ALTER TABLE clinical.allergies      FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.conditions     FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.medications    FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.surgeries      FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.lab_results    FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.vitals_history FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.vaccines       FORCE ROW LEVEL SECURITY;
ALTER TABLE clinical.documents      FORCE ROW LEVEL SECURITY;
-- Movido a 006: ALTER TABLE clinical.encounter_submissions FORCE ROW LEVEL SECURITY;

-- Políticas INSERT/UPDATE/DELETE para tablas clínicas
CREATE POLICY allergy_insert ON clinical.allergies
  FOR INSERT TO app_runtime WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY allergy_update ON clinical.allergies
  FOR UPDATE TO app_runtime
  USING (clinical.has_clinical_access(person_id))
  WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY allergy_no_delete ON clinical.allergies
  FOR DELETE TO app_runtime USING (FALSE);

CREATE POLICY condition_insert ON clinical.conditions
  FOR INSERT TO app_runtime WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY condition_update ON clinical.conditions
  FOR UPDATE TO app_runtime
  USING (clinical.has_clinical_access(person_id))
  WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY condition_no_delete ON clinical.conditions
  FOR DELETE TO app_runtime USING (FALSE);

CREATE POLICY medication_insert ON clinical.medications
  FOR INSERT TO app_runtime WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY medication_update ON clinical.medications
  FOR UPDATE TO app_runtime
  USING (clinical.has_clinical_access(person_id))
  WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY medication_no_delete ON clinical.medications
  FOR DELETE TO app_runtime USING (FALSE);

CREATE POLICY surgery_insert ON clinical.surgeries
  FOR INSERT TO app_runtime WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY surgery_update ON clinical.surgeries
  FOR UPDATE TO app_runtime
  USING (clinical.has_clinical_access(person_id))
  WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY surgery_no_delete ON clinical.surgeries
  FOR DELETE TO app_runtime USING (FALSE);

CREATE POLICY lab_insert ON clinical.lab_results
  FOR INSERT TO app_runtime WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY lab_update ON clinical.lab_results
  FOR UPDATE TO app_runtime
  USING (clinical.has_clinical_access(person_id))
  WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY lab_no_delete ON clinical.lab_results
  FOR DELETE TO app_runtime USING (FALSE);

CREATE POLICY vitals_insert ON clinical.vitals_history
  FOR INSERT TO app_runtime WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY vitals_no_update ON clinical.vitals_history
  FOR UPDATE TO app_runtime USING (FALSE);
CREATE POLICY vitals_no_delete ON clinical.vitals_history
  FOR DELETE TO app_runtime USING (FALSE);

CREATE POLICY vaccine_insert ON clinical.vaccines
  FOR INSERT TO app_runtime WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY vaccine_update ON clinical.vaccines
  FOR UPDATE TO app_runtime
  USING (clinical.has_clinical_access(person_id))
  WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY vaccine_no_delete ON clinical.vaccines
  FOR DELETE TO app_runtime USING (FALSE);

CREATE POLICY doc_insert ON clinical.documents
  FOR INSERT TO app_runtime WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY doc_update ON clinical.documents
  FOR UPDATE TO app_runtime
  USING (clinical.has_clinical_access(person_id))
  WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY doc_no_delete ON clinical.documents
  FOR DELETE TO app_runtime USING (FALSE);

GRANT SELECT, INSERT, UPDATE ON clinical.allergies      TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.conditions     TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.medications    TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.surgeries      TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.lab_results    TO app_runtime;
GRANT SELECT, INSERT         ON clinical.vitals_history TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.vaccines       TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.documents      TO app_runtime;
-- Movido a 006: GRANT SELECT, INSERT, UPDATE ON clinical.encounters     TO app_runtime;
-- Movido a 006: GRANT SELECT, INSERT, UPDATE ON clinical.encounter_submissions TO app_runtime;
GRANT SELECT, INSERT         ON clinical.document_ai_processing TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.document_shares TO app_runtime;
-- Movido a 006: GRANT SELECT, INSERT, UPDATE ON clinical.healthcare_professionals TO app_runtime;
-- Movido a 006: GRANT SELECT, INSERT         ON clinical.professional_verification_attempts TO app_runtime;
-- Movido a 006: GRANT SELECT, INSERT         ON clinical.professional_certifications TO app_runtime;
-- Movido a 006: GRANT SELECT, INSERT, UPDATE ON clinical.healthcare_organizations TO app_runtime;
-- Movido a 006: GRANT SELECT, INSERT, UPDATE ON clinical.organization_candidates TO app_runtime;
-- Movido a 006: GRANT SELECT, INSERT         ON clinical.organization_match_decisions TO app_runtime;
-- Movido a 006: GRANT SELECT, INSERT         ON clinical.encounter_locations TO app_runtime;
-- Movido a 006: GRANT SELECT, INSERT, UPDATE ON clinical.record_review_tasks TO app_runtime;
-- Movido a 006: GRANT SELECT, INSERT, UPDATE ON clinical.submission_visibility_policies TO app_runtime;
-- readonly_support NO tiene acceso al schema clinical

-- ══════════════════════════════════════════════════════════════
-- C10: Triggers de inmutabilidad — person_id y member_id
-- Definidos al final, después de CREATE TABLE
-- ══════════════════════════════════════════════════════════════
CREATE TRIGGER trg_allergies_immutable
  BEFORE UPDATE OF person_id, member_id ON clinical.allergies
  FOR EACH ROW EXECUTE FUNCTION clinical.deny_ownership_change();
CREATE TRIGGER trg_conditions_immutable
  BEFORE UPDATE OF person_id, member_id ON clinical.conditions
  FOR EACH ROW EXECUTE FUNCTION clinical.deny_ownership_change();
CREATE TRIGGER trg_medications_immutable
  BEFORE UPDATE OF person_id, member_id ON clinical.medications
  FOR EACH ROW EXECUTE FUNCTION clinical.deny_ownership_change();
CREATE TRIGGER trg_surgeries_immutable
  BEFORE UPDATE OF person_id, member_id ON clinical.surgeries
  FOR EACH ROW EXECUTE FUNCTION clinical.deny_ownership_change();
CREATE TRIGGER trg_lab_results_immutable
  BEFORE UPDATE OF person_id, member_id ON clinical.lab_results
  FOR EACH ROW EXECUTE FUNCTION clinical.deny_ownership_change();
CREATE TRIGGER trg_vaccines_immutable
  BEFORE UPDATE OF person_id, member_id ON clinical.vaccines
  FOR EACH ROW EXECUTE FUNCTION clinical.deny_ownership_change();
CREATE TRIGGER trg_documents_immutable
  BEFORE UPDATE OF person_id, member_id ON clinical.documents
  FOR EACH ROW EXECUTE FUNCTION clinical.deny_ownership_change();
