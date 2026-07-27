-- ============================================================
-- MedTravelApp — Schema SQL v1.2.3
-- 006_professionals.sql
-- CHANGELOG v1.2:
--   B7: healthcare_professionals vinculados a core.users
--       SIN password_hash, failed_login_count ni locked_until propios
--   B4: FKs reales a params.catalog_values(id) en todos los _id
--   B6: email y doc_number con blind_index para búsqueda y unicidad
-- ============================================================

-- ── PROFESIONALES DE SALUD — B7: auth unificada ──────────────
-- El profesional se autentica SIEMPRE a través de core.users
-- No existe segundo subsistema de autenticación
CREATE TABLE clinical.healthcare_professionals (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

  -- B7: vínculo al IAM central — obligatorio
  -- Un profesional ES un usuario del sistema
  user_id           UUID         NOT NULL UNIQUE REFERENCES core.users(id),

  -- Datos profesionales específicos (no de autenticación)
  first_name        TEXT         NOT NULL,
  last_name         TEXT         NOT NULL,
  doc_type_id       UUID         NOT NULL REFERENCES params.catalog_values(id),
  -- B6: doc_number cifrado con blind_index
  doc_number        BYTEA        NOT NULL,
  doc_number_idx    TEXT         NOT NULL,        -- HMAC blind index

  country_id        UUID         NOT NULL REFERENCES params.catalog_values(id),
  license_number    VARCHAR(100),
  license_country_id UUID        REFERENCES params.catalog_values(id),
  specialty_id      UUID         REFERENCES params.catalog_values(id),
  institution       TEXT,

  -- MTA-511: nivel de confianza escalonado (5 niveles)
  trust_level_id    UUID         NOT NULL REFERENCES params.catalog_values(id),
  -- REGISTERED / IDENTITY_VERIFIED / LICENSE_DECLARED /
  -- PROFESSIONAL_CERTIFIED / INSTITUTION_VERIFIED

  -- MFA — configurado en core.mfa_methods via user_id
  -- mfa_required se evalúa por trust_level en la API — no se duplica aquí
  mfa_required      BOOLEAN      NOT NULL DEFAULT FALSE,
  -- TRUE se activa automáticamente via trigger cuando trust_level >= PROFESSIONAL_CERTIFIED

  terms_accepted    BOOLEAN      NOT NULL DEFAULT FALSE,
  terms_accepted_at TIMESTAMPTZ,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,

  -- C4: retención
  deleted_at        TIMESTAMPTZ,
  deletion_reason_id UUID        REFERENCES params.catalog_values(id),

  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  -- Unicidad sobre blind index, no sobre BYTEA cifrado
  UNIQUE (doc_type_id, doc_number_idx)
);

-- Trigger: cuando trust_level cambia a >= PROFESSIONAL_CERTIFIED
-- activa mfa_required automáticamente
CREATE OR REPLACE FUNCTION clinical.enforce_mfa_on_certification()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, clinical, params
AS $$
BEGIN
  IF NEW.trust_level_id IN (
    SELECT cv.id FROM params.catalog_values cv
    JOIN params.domain_catalogs dc ON cv.domain_id = dc.id
    WHERE dc.code = 'PROFESSIONAL_TRUST_LEVEL'
      AND cv.code IN ('PROFESSIONAL_CERTIFIED','INSTITUTION_VERIFIED')
  ) THEN
    NEW.mfa_required := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_professional_mfa
  BEFORE INSERT OR UPDATE OF trust_level_id ON clinical.healthcare_professionals
  FOR EACH ROW EXECUTE FUNCTION clinical.enforce_mfa_on_certification();

-- MTA-511: intentos de verificación escalonados
CREATE TABLE clinical.professional_verification_attempts (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id   UUID         NOT NULL REFERENCES clinical.healthcare_professionals(id),
  target_level_id   UUID         NOT NULL REFERENCES params.catalog_values(id),
  method_id         UUID         NOT NULL REFERENCES params.catalog_values(id),
  evidence_type     VARCHAR(50)  NOT NULL,
  evidence_data     JSONB        NOT NULL DEFAULT '{}',
  confidence_score  NUMERIC(5,4) CHECK (confidence_score BETWEEN 0 AND 1),
  status_id         UUID         NOT NULL REFERENCES params.catalog_values(id),
  reviewer_notes    TEXT,
  reviewed_by       UUID,
  attempted_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);

-- MTA-511: certificaciones vigentes
CREATE TABLE clinical.professional_certifications (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id   UUID         NOT NULL REFERENCES clinical.healthcare_professionals(id),
  level_id          UUID         NOT NULL REFERENCES params.catalog_values(id),
  granted_by        UUID,
  source            VARCHAR(50)  NOT NULL,
  verification_data JSONB        NOT NULL DEFAULT '{}',
  valid_from        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  valid_until       TIMESTAMPTZ,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  revoked_at        TIMESTAMPTZ,
  revoke_reason     TEXT,
  revoked_by        UUID,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── ORGANIZACIONES DE SALUD con pipeline de deduplicación ────
CREATE TABLE clinical.healthcare_organizations (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT         NOT NULL,
  name_normalized      TEXT,        -- normalizado para búsqueda y dedup
  organization_type_id UUID         NOT NULL REFERENCES params.catalog_values(id),
  country_id           UUID         REFERENCES params.catalog_values(id),
  state_province       TEXT,
  city                 TEXT,
  address              TEXT,
  latitude             NUMERIC(10,8),
  longitude            NUMERIC(11,8),
  phone                TEXT,
  website              TEXT,
  email_domain         TEXT,        -- para verificación institucional
  sanitary_id          TEXT,
  verification_status_id UUID       NOT NULL REFERENCES params.catalog_values(id),
  alias_names          TEXT[],
  merged_into_id       UUID         REFERENCES clinical.healthcare_organizations(id),
  mention_count        INTEGER      NOT NULL DEFAULT 0,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Índice GIN para fuzzy matching (usa pg_trgm cargada en 000)
CREATE INDEX idx_org_trgm ON clinical.healthcare_organizations
  USING GIN (name_normalized gin_trgm_ops);
CREATE INDEX idx_org_city ON clinical.healthcare_organizations(country_id, city)
  WHERE is_active = TRUE;

-- Pipeline de deduplicación MTA-511
CREATE TABLE clinical.organization_candidates (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_name             TEXT         NOT NULL,
  raw_address          TEXT,
  raw_city             TEXT,
  raw_country_id       UUID         REFERENCES params.catalog_values(id),
  raw_phone            TEXT,
  raw_domain           TEXT,
  raw_identifiers      JSONB        NOT NULL DEFAULT '{}',
  existing_org_id      UUID         REFERENCES clinical.healthcare_organizations(id),
  confidence_score     NUMERIC(5,4) CHECK (confidence_score BETWEEN 0 AND 1),
  matching_signals     JSONB        NOT NULL DEFAULT '{}',
  pipeline_status_id   UUID         NOT NULL REFERENCES params.catalog_values(id),
  processed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE clinical.organization_match_decisions (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id           UUID         NOT NULL REFERENCES clinical.organization_candidates(id),
  organization_id        UUID         REFERENCES clinical.healthcare_organizations(id),
  decision_type_id       UUID         NOT NULL REFERENCES params.catalog_values(id),
  decided_by             UUID,
  auto_resolved          BOOLEAN      NOT NULL DEFAULT FALSE,
  confidence_at_decision NUMERIC(5,4),
  decision_notes         TEXT,
  can_undo               BOOLEAN      NOT NULL DEFAULT TRUE,
  undone_at              TIMESTAMPTZ,
  undone_by              UUID,
  decided_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── ENCOUNTERS Y SUBMISSIONS ─────────────────────────────────
CREATE TABLE clinical.encounters (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         UUID         NOT NULL REFERENCES core.persons(id),
  member_id         UUID         REFERENCES core.members(id),
  professional_id   UUID         NOT NULL REFERENCES clinical.healthcare_professionals(id),
  encounter_date    DATE         NOT NULL,
  encounter_type_id UUID         NOT NULL REFERENCES params.catalog_values(id),
  chief_complaint   TEXT,
  notes             TEXT,
  status_id         UUID         NOT NULL REFERENCES params.catalog_values(id),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE clinical.encounter_locations (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id      UUID         NOT NULL REFERENCES clinical.encounters(id),
  organization_id   UUID         REFERENCES clinical.healthcare_organizations(id),
  location_type_id  UUID         NOT NULL REFERENCES params.catalog_values(id),
  free_text_name    TEXT,
  free_text_address TEXT,
  country_id        UUID         REFERENCES params.catalog_values(id),
  city              TEXT,
  department_unit   TEXT,
  room_or_office    TEXT,
  was_emergency     BOOLEAN      NOT NULL DEFAULT FALSE,
  latitude          NUMERIC(10,8),
  longitude         NUMERIC(11,8),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT location_has_data CHECK (
    organization_id IS NOT NULL OR free_text_name IS NOT NULL
  )
);

-- MTA-511: submissions separadas del historial canónico
CREATE TABLE clinical.encounter_submissions (
  id                           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id                 UUID         NOT NULL REFERENCES clinical.encounters(id),
  person_id                    UUID         NOT NULL REFERENCES core.persons(id),
  member_id                    UUID         REFERENCES core.members(id),
  professional_id              UUID         NOT NULL REFERENCES clinical.healthcare_professionals(id),
  submission_type_id           UUID         NOT NULL REFERENCES params.catalog_values(id),
  clinical_data                JSONB        NOT NULL,
  icd10_code                   VARCHAR(10),
  rxnorm_code                  VARCHAR(20),
  document_id                  UUID         REFERENCES clinical.documents(id),
  -- MTA-511: 3 campos de estado independientes
  canonical_status_id          UUID         NOT NULL REFERENCES params.catalog_values(id),
  confirmation_status_id       UUID         REFERENCES params.catalog_values(id),
  certification_status_id      UUID         REFERENCES params.catalog_values(id),
  requires_member_confirmation BOOLEAN      NOT NULL DEFAULT TRUE,
  member_reviewed_at           TIMESTAMPTZ,
  member_confirmed             BOOLEAN,
  member_challenged            BOOLEAN      NOT NULL DEFAULT FALSE,
  member_challenge_notes       TEXT,
  -- Snapshot del profesional al momento del submission
  professional_license_snapshot TEXT,
  professional_trust_level_snapshot VARCHAR(50),
  professional_country_snapshot VARCHAR(3),
  submission_ip                INET,
  submission_device            TEXT,
  canonical_record_id          UUID,
  canonical_record_table       VARCHAR(100),
  -- C4: retención
  deleted_at                   TIMESTAMPTZ,
  deletion_reason_id           UUID         REFERENCES params.catalog_values(id),
  created_at                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Tareas de revisión humana
CREATE TABLE clinical.record_review_tasks (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id     UUID         NOT NULL REFERENCES clinical.encounter_submissions(id),
  person_id         UUID         NOT NULL REFERENCES core.persons(id),
  assigned_to       UUID,
  priority_id       UUID         NOT NULL REFERENCES params.catalog_values(id),
  review_deadline   TIMESTAMPTZ,
  decision_id       UUID         REFERENCES params.catalog_values(id),
  reviewer_notes    TEXT,
  decided_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Política de visibilidad MTA-511
CREATE TABLE clinical.submission_visibility_policies (
  id                              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id                       UUID         NOT NULL UNIQUE REFERENCES core.members(id),
  share_provisional_in_emergency  BOOLEAN      NOT NULL DEFAULT TRUE,
  share_provisional_always        BOOLEAN      NOT NULL DEFAULT FALSE,
  show_provisional_label          BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_at                      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── ÍNDICES PROFESSIONALS ─────────────────────────────────────
CREATE INDEX idx_professionals_trust   ON clinical.healthcare_professionals(trust_level_id)
  WHERE is_active = TRUE;
CREATE INDEX idx_professionals_user    ON clinical.healthcare_professionals(user_id);
CREATE INDEX idx_prof_doc_idx          ON clinical.healthcare_professionals(doc_number_idx);
CREATE INDEX idx_org_candidates_status ON clinical.organization_candidates(pipeline_status_id);
CREATE INDEX idx_encounters_person     ON clinical.encounters(person_id, encounter_date DESC);
CREATE INDEX idx_submissions_person    ON clinical.encounter_submissions(person_id, created_at DESC);
CREATE INDEX idx_submissions_pending   ON clinical.encounter_submissions(member_id)
  WHERE member_confirmed IS NULL AND deleted_at IS NULL;
CREATE INDEX idx_submissions_canonical ON clinical.encounter_submissions(canonical_status_id, person_id);
CREATE INDEX idx_review_pending        ON clinical.record_review_tasks(assigned_to, review_deadline)
  WHERE decided_at IS NULL;

-- ── RLS PROFESSIONALS ─────────────────────────────────────────
ALTER TABLE clinical.encounters            ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.encounter_submissions ENABLE ROW LEVEL SECURITY;

-- Encounters: acceso por person_id usando la función centralizada
CREATE POLICY encounters_access ON clinical.encounters
  USING (
    clinical.has_clinical_access(person_id)
    OR professional_id IN (
      SELECT id FROM clinical.healthcare_professionals
      WHERE user_id = app.current_uuid('app.current_user_id')
    )
  );

-- Submissions: igual que encounters
CREATE POLICY submissions_access ON clinical.encounter_submissions
  USING (
    clinical.has_clinical_access(person_id)
    OR professional_id IN (
      SELECT id FROM clinical.healthcare_professionals
      WHERE user_id = app.current_uuid('app.current_user_id')
    )
  );

-- ── TRIGGERS PROFESSIONALS ────────────────────────────────────
CREATE TRIGGER trg_professionals_upd
  BEFORE UPDATE ON clinical.healthcare_professionals
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_encounters_upd
  BEFORE UPDATE ON clinical.encounters
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_submissions_upd
  BEFORE UPDATE ON clinical.encounter_submissions
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_orgs_upd
  BEFORE UPDATE ON clinical.healthcare_organizations
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- Audit
CREATE TRIGGER audit_professionals
  AFTER INSERT OR UPDATE OR DELETE ON clinical.healthcare_professionals
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();
CREATE TRIGGER audit_submissions
  AFTER INSERT OR UPDATE OR DELETE ON clinical.encounter_submissions
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();

-- FORCE RLS para encounter_submissions (creada aquí)
ALTER TABLE clinical.encounter_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.encounter_submissions FORCE ROW LEVEL SECURITY;
CREATE POLICY submission_insert ON clinical.encounter_submissions
  FOR INSERT TO app_runtime WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY submission_update ON clinical.encounter_submissions
  FOR UPDATE TO app_runtime
  USING (clinical.has_clinical_access(person_id))
  WITH CHECK (clinical.has_clinical_access(person_id));
CREATE POLICY submission_no_delete ON clinical.encounter_submissions
  FOR DELETE TO app_runtime USING (FALSE);
GRANT SELECT, INSERT, UPDATE ON clinical.encounter_submissions TO app_runtime;

-- GRANTs adicionales para tablas creadas en 006
GRANT SELECT, INSERT, UPDATE ON clinical.encounters TO app_runtime;
GRANT SELECT, INSERT         ON clinical.encounter_locations TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.record_review_tasks TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.submission_visibility_policies TO app_runtime;

-- GRANTs desde 005 — tablas creadas en 006
GRANT SELECT, INSERT, UPDATE ON clinical.healthcare_professionals TO app_runtime;
GRANT SELECT, INSERT         ON clinical.professional_verification_attempts TO app_runtime;
GRANT SELECT, INSERT         ON clinical.professional_certifications TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.healthcare_organizations TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.organization_candidates TO app_runtime;
GRANT SELECT, INSERT         ON clinical.organization_match_decisions TO app_runtime;

-- C10: person_id y member_id inmutables en encounter_submissions
CREATE TRIGGER trg_submissions_immutable
  BEFORE UPDATE OF person_id, member_id ON clinical.encounter_submissions
  FOR EACH ROW EXECUTE FUNCTION clinical.deny_ownership_change();

-- GRANTs de tablas creadas en 006 (movidos desde 005)
GRANT SELECT, INSERT, UPDATE ON clinical.encounters     TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.healthcare_professionals TO app_runtime;
GRANT SELECT, INSERT         ON clinical.professional_verification_attempts TO app_runtime;
GRANT SELECT, INSERT         ON clinical.professional_certifications TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.healthcare_organizations TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.organization_candidates TO app_runtime;
GRANT SELECT, INSERT         ON clinical.organization_match_decisions TO app_runtime;
GRANT SELECT, INSERT         ON clinical.encounter_locations TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.record_review_tasks TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON clinical.submission_visibility_policies TO app_runtime;
