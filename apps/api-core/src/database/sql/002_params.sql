-- ============================================================
-- MedTravelApp — Schema SQL v1.2.3
-- 002_params.sql
-- CHANGELOG v1.2:
--   B4: FKs reales a params.catalog_values(id) declaradas como
--       tablas de referencia propias (catalog_values se auto-referencia)
--   B9: vencimientos de tokens movidos a operational_limits
--       (no hardcodeados en seeds ni constraints)
-- ============================================================

-- ── DOMINIO 1: Domain Catalogs ────────────────────────────────
CREATE TABLE params.domain_catalogs (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  VARCHAR(100) NOT NULL UNIQUE,
  name_es               VARCHAR(200) NOT NULL,
  name_en               VARCHAR(200),
  name_pt               VARCHAR(200),
  description_es        TEXT,
  allows_tenant_override BOOLEAN     NOT NULL DEFAULT FALSE,
  allows_custom_values  BOOLEAN      NOT NULL DEFAULT FALSE,
  is_ordered            BOOLEAN      NOT NULL DEFAULT FALSE,
  is_system             BOOLEAN      NOT NULL DEFAULT TRUE,
  active                BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE params.catalog_values (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_id             UUID         NOT NULL REFERENCES params.domain_catalogs(id),
  tenant_id             UUID,        -- NULL = global
  code                  VARCHAR(100) NOT NULL,
  label_es              VARCHAR(200) NOT NULL,
  label_en              VARCHAR(200),
  label_pt              VARCHAR(200),
  label_fr              VARCHAR(200),
  description_es        TEXT,
  description_en        TEXT,
  display_order         SMALLINT     NOT NULL DEFAULT 0,
  metadata              JSONB        NOT NULL DEFAULT '{}',
  is_default            BOOLEAN      NOT NULL DEFAULT FALSE,
  is_system             BOOLEAN      NOT NULL DEFAULT FALSE,
  active                BOOLEAN      NOT NULL DEFAULT TRUE,
  valid_from            DATE,
  valid_until           DATE,
  lifecycle_status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                        CHECK (lifecycle_status IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
  approved_by           UUID,
  approved_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (domain_id, tenant_id, code)
);

CREATE TABLE params.catalog_translations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value_id          UUID NOT NULL REFERENCES params.catalog_values(id) ON DELETE CASCADE,
  language_code     CHAR(5) NOT NULL,
  label             VARCHAR(200) NOT NULL,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (value_id, language_code)
);

-- ── DOMINIO 2: Workflow Definitions ──────────────────────────
CREATE TABLE params.workflow_definitions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID,
  code              VARCHAR(100) NOT NULL,
  name_es           VARCHAR(200) NOT NULL,
  entity_type       VARCHAR(100) NOT NULL,
  initial_state     VARCHAR(100) NOT NULL,
  terminal_states   TEXT[]       NOT NULL,
  lifecycle_status  VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                    CHECK (lifecycle_status IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
  approved_by       UUID,
  approved_at       TIMESTAMPTZ,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE params.state_transitions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id       UUID         NOT NULL REFERENCES params.workflow_definitions(id),
  from_state        VARCHAR(100) NOT NULL,
  to_state          VARCHAR(100) NOT NULL,
  trigger_event     VARCHAR(100) NOT NULL,
  allowed_roles     TEXT[],
  conditions        JSONB        NOT NULL DEFAULT '{}',
  display_order     SMALLINT     NOT NULL DEFAULT 0,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE params.workflow_actions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  transition_id     UUID         NOT NULL REFERENCES params.state_transitions(id),
  action_type       VARCHAR(50)  NOT NULL,
  action_config     JSONB        NOT NULL,
  execution_order   SMALLINT     NOT NULL DEFAULT 0,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── DOMINIO 3: Rules Engine ───────────────────────────────────
CREATE TABLE params.policy_rules (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID,
  code              VARCHAR(100) NOT NULL,
  name_es           VARCHAR(200) NOT NULL,
  rule_type         VARCHAR(50)  NOT NULL,
  entity_scope      VARCHAR(100),
  priority          SMALLINT     NOT NULL DEFAULT 0,
  lifecycle_status  VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                    CHECK (lifecycle_status IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
  approved_by       UUID,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE params.rule_conditions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           UUID         NOT NULL REFERENCES params.policy_rules(id),
  field_path        VARCHAR(200) NOT NULL,
  operator          VARCHAR(30)  NOT NULL,
  value_type        VARCHAR(20)  NOT NULL,
  value             JSONB        NOT NULL,
  logical_group     SMALLINT     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE params.rule_actions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id           UUID         NOT NULL REFERENCES params.policy_rules(id),
  action_type       VARCHAR(50)  NOT NULL,
  action_payload    JSONB        NOT NULL,
  execution_order   SMALLINT     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── DOMINIO 4: Schema-driven Forms ───────────────────────────
CREATE TABLE params.form_schemas (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID,
  code              VARCHAR(100) NOT NULL,
  name_es           VARCHAR(200) NOT NULL,
  entity_type       VARCHAR(100) NOT NULL,
  country_id        UUID,        -- FK a catalog_values (COUNTRY)
  plan_type         VARCHAR(100),
  version           SMALLINT     NOT NULL DEFAULT 1,
  lifecycle_status  VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                    CHECK (lifecycle_status IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE params.field_definitions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id         UUID         NOT NULL REFERENCES params.form_schemas(id),
  field_key         VARCHAR(100) NOT NULL,
  field_type        VARCHAR(30)  NOT NULL,
  label_es          VARCHAR(200) NOT NULL,
  label_en          VARCHAR(200),
  placeholder_es    VARCHAR(200),
  is_required       BOOLEAN      NOT NULL DEFAULT FALSE,
  is_visible        BOOLEAN      NOT NULL DEFAULT TRUE,
  catalog_domain    VARCHAR(100),
  display_order     SMALLINT     NOT NULL DEFAULT 0,
  validation_hints  JSONB        NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE params.validation_rules (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id          UUID         NOT NULL REFERENCES params.field_definitions(id),
  rule_type         VARCHAR(30)  NOT NULL,
  rule_value        JSONB        NOT NULL,
  error_message_es  VARCHAR(500),
  error_message_en  VARCHAR(500),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── DOMINIO 5: Design Tokens & Themes ────────────────────────
CREATE TABLE params.design_token_sets (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID,
  name              VARCHAR(100) NOT NULL,
  platform          VARCHAR(10)  NOT NULL CHECK (platform IN ('APP','WEB','BOTH')),
  tokens            JSONB        NOT NULL DEFAULT '{}',
  lifecycle_status  VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                    CHECK (lifecycle_status IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
  is_default        BOOLEAN      NOT NULL DEFAULT FALSE,
  supports_dark_mode BOOLEAN     NOT NULL DEFAULT FALSE,
  dark_tokens       JSONB        NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE params.tenant_themes (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID         NOT NULL,
  token_set_id      UUID         REFERENCES params.design_token_sets(id),
  theme_name        VARCHAR(100) NOT NULL,
  platform          VARCHAR(10)  NOT NULL CHECK (platform IN ('APP','WEB','BOTH')),
  color_primary     CHAR(7),
  color_secondary   CHAR(7),
  color_accent      CHAR(7),
  color_success     CHAR(7),
  color_warning     CHAR(7),
  color_danger      CHAR(7),
  color_bg_primary  CHAR(7),
  color_text_primary CHAR(7),
  color_emergency_alert CHAR(7),
  font_family_primary VARCHAR(100),
  font_size_base    SMALLINT,
  border_radius_md  SMALLINT,
  logo_url          VARCHAR(500),
  logo_dark_url     VARCHAR(500),
  logo_icon_url     VARCHAR(500),
  splash_bg_color   CHAR(7),
  is_default        BOOLEAN      NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── DOMINIO 6: Integration Profiles ──────────────────────────
CREATE TABLE params.partner_api_profiles (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID         NOT NULL,
  profile_code      VARCHAR(100) NOT NULL,
  integration_type  VARCHAR(30)  NOT NULL,
  base_url          TEXT         NOT NULL,
  auth_type         VARCHAR(20)  NOT NULL,
  auth_config       JSONB        NOT NULL DEFAULT '{}',
  timeout_ms        INTEGER      NOT NULL DEFAULT 30000,
  retry_attempts    SMALLINT     NOT NULL DEFAULT 3,
  retry_delay_ms    INTEGER      NOT NULL DEFAULT 1000,
  lifecycle_status  VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                    CHECK (lifecycle_status IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, profile_code)
);

CREATE TABLE params.field_mappings (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID         NOT NULL REFERENCES params.partner_api_profiles(id),
  direction         VARCHAR(10)  NOT NULL CHECK (direction IN ('IN','OUT','BOTH')),
  source_field      VARCHAR(200) NOT NULL,
  target_field      VARCHAR(200) NOT NULL,
  transform_type    VARCHAR(30),
  transform_config  JSONB        NOT NULL DEFAULT '{}',
  is_required       BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE params.integration_contracts (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id        UUID         NOT NULL REFERENCES params.partner_api_profiles(id),
  contract_version  VARCHAR(20)  NOT NULL,
  schema_definition JSONB        NOT NULL,
  valid_from        DATE         NOT NULL,
  valid_until       DATE,
  is_current        BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── DOMINIO 7: Feature Flags ──────────────────────────────────
CREATE TABLE params.feature_flags (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID,
  flag_key          VARCHAR(200) NOT NULL,
  flag_type         VARCHAR(20)  NOT NULL
                    CHECK (flag_type IN ('BOOLEAN','STRING','INTEGER','JSON')),
  default_value     JSONB        NOT NULL,
  description_es    TEXT,
  is_sensitive      BOOLEAN      NOT NULL DEFAULT FALSE,
  requires_approval BOOLEAN      NOT NULL DEFAULT FALSE,
  lifecycle_status  VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                    CHECK (lifecycle_status IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
  approved_by       UUID,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, flag_key)
);

CREATE TABLE params.flag_overrides (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_id           UUID         NOT NULL REFERENCES params.feature_flags(id),
  scope_type        VARCHAR(20)  NOT NULL
                    CHECK (scope_type IN ('TENANT','COUNTRY','PLAN','MEMBER')),
  scope_id          UUID         NOT NULL,
  override_value    JSONB        NOT NULL,
  valid_from        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  valid_until       TIMESTAMPTZ,
  created_by        UUID,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- B9: operational_limits — reemplaza vencimientos hardcodeados
-- Los TTL de tokens, SLA y otros límites se leen de aquí en runtime
-- No van hardcodeados en seeds, constraints ni lógica de aplicación
CREATE TABLE params.operational_limits (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID,        -- NULL = global
  limit_key         VARCHAR(200) NOT NULL,
  -- Ejemplos de claves:
  -- TOKEN_DYNAMIC_QR_TTL_SECONDS    → 60
  -- TOKEN_PRE_QR_TTL_HOURS          → 72
  -- TOKEN_EMERGENCY_LINK_MAX_HOURS  → 72
  -- TOKEN_DOCTOR_INVITE_TTL_DAYS    → 7
  -- TOKEN_OFFLINE_ACCESS_MAX_HOURS  → 48
  -- CASE_SLA_FIRST_RESPONSE_SECONDS → 180
  -- CASE_SLA_ESCALATION_SECONDS     → 600
  -- PROFESSIONAL_CERT_OTP_TTL_MINUTES → 15
  -- ANALYTICS_CACHE_REFRESH_MINUTES → 15
  limit_value       INTEGER      NOT NULL,
  unit              VARCHAR(20)  NOT NULL,
  description_es    TEXT,
  requires_approval BOOLEAN      NOT NULL DEFAULT FALSE,
  lifecycle_status  VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                    CHECK (lifecycle_status IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
  approved_by       UUID,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, limit_key)
);

-- ── DOMINIO 8: Consent & Retention Policies ──────────────────
CREATE TABLE params.retention_policies (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID,
  entity_type           VARCHAR(100) NOT NULL,
  jurisdiction          VARCHAR(10)  NOT NULL,
  regulation            VARCHAR(20)  NOT NULL,
  retention_days        INTEGER      NOT NULL,
  archive_after_days    INTEGER,
  anonymize_after_days  INTEGER,
  action_on_expiry      VARCHAR(20)  NOT NULL
                        CHECK (action_on_expiry IN (
                          'DELETE','ANONYMIZE','ARCHIVE','MANUAL_REVIEW'
                        )),
  legal_basis           TEXT,
  lifecycle_status      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                        CHECK (lifecycle_status IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
  approved_by           UUID,
  approved_at           TIMESTAMPTZ,
  active                BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- FK retroactiva desde audit al dominio 8
-- FK diferida: se agrega en 001_audit.sql después de crear params.retention_policies
-- ALTER TABLE audit.data_archive_records ADD CONSTRAINT fk_archive_retention_policy
--   FOREIGN KEY (retention_policy_id) REFERENCES params.retention_policies(id);

-- FK diferida: se agrega en 001_audit.sql
-- ALTER TABLE audit.data_anonymization_jobs ADD CONSTRAINT fk_anon_retention_policy
--   FOREIGN KEY (retention_policy_id) REFERENCES params.retention_policies(id);

CREATE TABLE params.consent_purposes (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID,
  code                  VARCHAR(100) NOT NULL,
  name_es               VARCHAR(200) NOT NULL,
  name_en               VARCHAR(200),
  description_es        TEXT         NOT NULL,
  description_en        TEXT,
  legal_basis           VARCHAR(50)  NOT NULL,
  data_categories       TEXT[]       NOT NULL,
  retention_policy_id   UUID         REFERENCES params.retention_policies(id),
  is_mandatory          BOOLEAN      NOT NULL DEFAULT FALSE,
  active                BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE params.jurisdiction_rules (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction      VARCHAR(10)  NOT NULL,
  regulation        VARCHAR(20)  NOT NULL,
  rule_type         VARCHAR(50)  NOT NULL,
  rule_config       JSONB        NOT NULL,
  effective_from    DATE         NOT NULL,
  effective_until   DATE,
  description_es    TEXT,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── ÍNDICES PARAMS ────────────────────────────────────────────
CREATE INDEX idx_catalog_values_domain ON params.catalog_values(domain_id, tenant_id)
  WHERE active = TRUE AND lifecycle_status = 'ACTIVE';
CREATE INDEX idx_catalog_values_code ON params.catalog_values(domain_id, code)
  WHERE active = TRUE;
CREATE INDEX idx_feature_flags_key ON params.feature_flags(tenant_id, flag_key)
  WHERE active = TRUE;
CREATE INDEX idx_operational_limits_key ON params.operational_limits(tenant_id, limit_key)
  WHERE lifecycle_status = 'ACTIVE';
CREATE INDEX idx_retention_entity ON params.retention_policies(entity_type, jurisdiction)
  WHERE active = TRUE;

-- ── TRIGGERS PARAMS ───────────────────────────────────────────
CREATE TRIGGER trg_domain_catalogs_upd
  BEFORE UPDATE ON params.domain_catalogs
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_catalog_values_upd
  BEFORE UPDATE ON params.catalog_values
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_feature_flags_upd
  BEFORE UPDATE ON params.feature_flags
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_operational_limits_upd
  BEFORE UPDATE ON params.operational_limits
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_retention_policies_upd
  BEFORE UPDATE ON params.retention_policies
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
