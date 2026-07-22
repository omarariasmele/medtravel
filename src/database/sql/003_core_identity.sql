-- ============================================================
-- MedTravelApp — Schema SQL v1.2.3
-- 003_core_identity.sql
-- CHANGELOG v1.2:
--   B4: FKs reales a params.catalog_values(id) en todos los _id
--   B6: blind_index para email y doc_number (UNIQUE sobre hash, no sobre BYTEA cifrado)
--   B7: healthcare_professionals ya NO tiene password_hash — se vincula a core.users
--   B3: RLS refactorizado — acceso clínico separado de pertenencia al tenant
-- ============================================================

-- ── HELPER: función para FK diferida a catalog_values ─────────
-- Usada para validar que un UUID referencia al dominio correcto
-- Se llama desde CHECK constraints cuando se necesita validación de dominio
CREATE OR REPLACE FUNCTION params.is_valid_catalog(
  p_value_id    UUID,
  p_domain_code VARCHAR
) RETURNS BOOLEAN LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM params.catalog_values cv
    JOIN params.domain_catalogs dc ON cv.domain_id = dc.id
    WHERE cv.id = p_value_id
      AND dc.code = p_domain_code
      AND cv.active = TRUE
      AND cv.lifecycle_status = 'ACTIVE'
  );
END;
$$;

-- ── TENANTS ───────────────────────────────────────────────────
CREATE TABLE core.tenants (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code              VARCHAR(20)  NOT NULL UNIQUE,
  name              VARCHAR(200) NOT NULL,
  legal_name        VARCHAR(200),
  -- B4: FK real a catalog_values
  country_id        UUID         REFERENCES params.catalog_values(id),
  contact_email     VARCHAR(200),
  contact_phone     VARCHAR(50),
  api_key_hash      TEXT,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE core.tenant_app_variants (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID         NOT NULL REFERENCES core.tenants(id),
  variant_type_id   UUID         NOT NULL REFERENCES params.catalog_values(id),
  bundle_id         VARCHAR(200),
  app_name          VARCHAR(200) NOT NULL,
  store_url_ios     VARCHAR(500),
  store_url_android VARCHAR(500),
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE core.tenant_brand_profiles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES core.tenants(id),
  variant_id        UUID REFERENCES core.tenant_app_variants(id),
  theme_id          UUID REFERENCES params.tenant_themes(id),
  logo_url          VARCHAR(500),
  logo_dark_url     VARCHAR(500),
  logo_icon_url     VARCHAR(500),
  favicon_url       VARCHAR(500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PERSONS ───────────────────────────────────────────────────
CREATE TABLE core.persons (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name           TEXT        NOT NULL,
  last_name            TEXT        NOT NULL,
  birth_date           DATE,
  -- B4: FKs reales a catalog_values
  gender_id            UUID        REFERENCES params.catalog_values(id),
  nationality_id       UUID        REFERENCES params.catalog_values(id),
  country_residence_id UUID        REFERENCES params.catalog_values(id),
  preferred_lang       CHAR(5)     NOT NULL DEFAULT 'es',
  timezone             VARCHAR(50) NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  active               BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE core.external_identifiers (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         UUID        NOT NULL REFERENCES core.persons(id),
  doc_type_id       UUID        NOT NULL REFERENCES params.catalog_values(id),
  -- B6: doc_number cifrado + blind_index para unicidad y búsqueda
  doc_number        BYTEA       NOT NULL,             -- AES-256 cifrado
  doc_number_idx    TEXT        NOT NULL,             -- HMAC blind index para búsqueda
  issuing_country_id UUID       REFERENCES params.catalog_values(id),
  expiry_date       DATE,
  is_primary        BOOLEAN     NOT NULL DEFAULT FALSE,
  active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Unicidad sobre el blind index, no sobre el BYTEA cifrado
  UNIQUE (doc_type_id, issuing_country_id, doc_number_idx)
);

-- ── USERS ─────────────────────────────────────────────────────
CREATE TABLE core.users (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         UUID        NOT NULL UNIQUE REFERENCES core.persons(id),
  -- B6: email cifrado + blind_index separado para búsqueda y UNIQUE
  email             BYTEA       NOT NULL,             -- AES-256 cifrado
  email_blind_index TEXT        NOT NULL UNIQUE,      -- HMAC-SHA256 del email normalizado
  email_verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  phone             BYTEA,                            -- AES-256 cifrado
  phone_blind_index TEXT,                             -- HMAC-SHA256 para búsqueda
  phone_verified    BOOLEAN     NOT NULL DEFAULT FALSE,
  preferred_lang    CHAR(5)     NOT NULL DEFAULT 'es',
  last_login_at     TIMESTAMPTZ,
  active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- B7: credenciales — SOLO para users (no duplicadas en professionals)
CREATE TABLE core.authentication_credentials (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL UNIQUE REFERENCES core.users(id),
  password_hash     TEXT        NOT NULL,   -- bcrypt/argon2
  created_by_user_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_changed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  must_change       BOOLEAN     NOT NULL DEFAULT FALSE,
  failed_attempts   SMALLINT    NOT NULL DEFAULT 0,
  locked_until      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE core.password_reset_tokens (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES core.users(id),
  token_hash        TEXT        NOT NULL UNIQUE,
  -- B9: TTL leído de operational_limits en runtime, no hardcodeado
  expires_at        TIMESTAMPTZ NOT NULL,
  used              BOOLEAN     NOT NULL DEFAULT FALSE,
  used_at           TIMESTAMPTZ,
  request_ip        INET,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE core.mfa_methods (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL REFERENCES core.users(id),
  method_type_id    UUID        NOT NULL REFERENCES params.catalog_values(id),
  method_value      BYTEA,      -- CIFRADO (secreto TOTP, etc.)
  is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
  is_primary        BOOLEAN     NOT NULL DEFAULT FALSE,
  verified_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE core.security_sessions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID        NOT NULL REFERENCES core.users(id),
  -- B6: tokens almacenados como hash, no en texto plano
  session_token_hash    TEXT        NOT NULL UNIQUE,
  refresh_token_hash    TEXT        UNIQUE,
  device_fingerprint    TEXT,
  device_name           TEXT,
  ip_address            INET,
  device_type_id        UUID        REFERENCES params.catalog_values(id),
  -- B9: TTL leído de operational_limits en runtime
  expires_at            TIMESTAMPTZ NOT NULL,
  last_activity_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
  revoked_at            TIMESTAMPTZ,
  revoke_reason_id      UUID        REFERENCES params.catalog_values(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MEMBERS ───────────────────────────────────────────────────
CREATE TABLE core.members (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id                 UUID        NOT NULL REFERENCES core.persons(id),
  tenant_id                 UUID        NOT NULL REFERENCES core.tenants(id),
  tenant_member_number      VARCHAR(100),
  status_id                 UUID        NOT NULL REFERENCES params.catalog_values(id),
  onboarding_completed      BOOLEAN     NOT NULL DEFAULT FALSE,
  history_completeness_pct  SMALLINT    NOT NULL DEFAULT 0
                            CHECK (history_completeness_pct BETWEEN 0 AND 100),
  enrollment_date           DATE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (person_id, tenant_id)
);

-- ── MATCHING ──────────────────────────────────────────────────
CREATE TABLE core.partner_member_records (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID        NOT NULL REFERENCES core.tenants(id),
  partner_ref_id    VARCHAR(100) NOT NULL,
  raw_name          TEXT,
  raw_doc_type      VARCHAR(50),
  raw_doc_number    TEXT,       -- dato del partner, sin cifrar
  policy_number     VARCHAR(100) NOT NULL,
  plan_code         VARCHAR(100),
  valid_from        DATE        NOT NULL,
  valid_until       DATE        NOT NULL,
  import_status_id  UUID        NOT NULL REFERENCES params.catalog_values(id),
  import_batch_id   UUID,
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, partner_ref_id)
);

CREATE TABLE core.identity_match_candidates (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_record_id UUID        NOT NULL REFERENCES core.partner_member_records(id),
  person_id         UUID        NOT NULL REFERENCES core.persons(id),
  confidence_score  NUMERIC(5,4) NOT NULL CHECK (confidence_score BETWEEN 0 AND 1),
  match_type_id     UUID        NOT NULL REFERENCES params.catalog_values(id),
  evidence          JSONB       NOT NULL DEFAULT '{}',
  status_id         UUID        NOT NULL REFERENCES params.catalog_values(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE core.identity_match_decisions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id      UUID        NOT NULL REFERENCES core.identity_match_candidates(id),
  member_id         UUID        REFERENCES core.members(id),
  decision_id       UUID        NOT NULL REFERENCES params.catalog_values(id),
  decided_by        UUID,
  auto_resolved     BOOLEAN     NOT NULL DEFAULT FALSE,
  decision_notes    TEXT,
  decided_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CONSENTIMIENTOS ───────────────────────────────────────────
CREATE TABLE core.member_data_consents (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             UUID        NOT NULL REFERENCES core.members(id),
  tenant_id             UUID        NOT NULL REFERENCES core.tenants(id),
  purpose_id            UUID        NOT NULL REFERENCES params.consent_purposes(id),
  granted               BOOLEAN     NOT NULL,
  granted_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until           TIMESTAMPTZ,
  consent_text_version  VARCHAR(20) NOT NULL,
  withdrawal_at         TIMESTAMPTZ,
  withdrawal_reason     TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CONTACTOS ─────────────────────────────────────────────────
CREATE TABLE core.member_contacts (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id               UUID        NOT NULL REFERENCES core.members(id),
  linked_member_id        UUID        REFERENCES core.members(id),
  first_name              TEXT        NOT NULL,
  last_name               TEXT        NOT NULL,
  relationship_type_id    UUID        NOT NULL REFERENCES params.catalog_values(id),
  email                   BYTEA,      -- CIFRADO
  email_blind_index       TEXT,       -- HMAC para búsqueda
  phone                   BYTEA,      -- CIFRADO
  phone_blind_index       TEXT,
  phone_country_id        UUID        REFERENCES params.catalog_values(id),
  is_emergency_contact    BOOLEAN     NOT NULL DEFAULT TRUE,
  is_travel_companion     BOOLEAN     NOT NULL DEFAULT FALSE,
  contact_priority        SMALLINT    NOT NULL DEFAULT 1,
  can_view_medical        BOOLEAN     NOT NULL DEFAULT FALSE,
  active                  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── ÍNDICES CORE ──────────────────────────────────────────────
-- B6: índices sobre blind indexes, no sobre columnas cifradas
CREATE INDEX idx_users_email_idx   ON core.users(email_blind_index);
CREATE INDEX idx_extid_doc_idx     ON core.external_identifiers(doc_number_idx);
CREATE INDEX idx_contacts_email_idx ON core.member_contacts(email_blind_index)
  WHERE email_blind_index IS NOT NULL;

CREATE INDEX idx_members_person    ON core.members(person_id);
CREATE INDEX idx_members_tenant    ON core.members(tenant_id, status_id);
CREATE INDEX idx_partner_records   ON core.partner_member_records(tenant_id, import_status_id);
CREATE INDEX idx_match_candidates  ON core.identity_match_candidates(partner_record_id, status_id);
CREATE INDEX idx_sessions_active   ON core.security_sessions(user_id, expires_at)
  WHERE is_active = TRUE;
CREATE INDEX idx_reset_tokens      ON core.password_reset_tokens(user_id)
  WHERE used = FALSE;
CREATE INDEX idx_consents_member   ON core.member_data_consents(member_id, granted);
CREATE INDEX idx_contacts_member   ON core.member_contacts(member_id, contact_priority)
  WHERE is_emergency_contact = TRUE AND active = TRUE;

-- ── RLS CORE — B3: refactorizado ─────────────────────────────
ALTER TABLE core.persons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.members              ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.member_contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.member_data_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.security_sessions    ENABLE ROW LEVEL SECURITY;

-- B3: Política persons — solo el propio titular o superadmin
-- El tenant NO accede a core.persons directamente
-- El acceso del tenant es solo a través de core.members
CREATE POLICY persons_self_access ON core.persons
  USING (
    id = app.current_uuid('app.current_person_id')
    -- B3: is_superadmin eliminado
  );

-- B3: members — tenant ve sus members; person ve los suyos
CREATE POLICY members_tenant_or_self ON core.members
  USING (
    tenant_id = app.current_uuid('app.current_tenant_id')
    OR person_id = app.current_uuid('app.current_person_id')
    -- B3: is_superadmin eliminado
  );

-- Contactos siguen al member con misma política
CREATE POLICY contacts_member_access ON core.member_contacts
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
        OR tenant_id = app.current_uuid('app.current_tenant_id')
    )
    -- B3: is_superadmin eliminado
  );

-- Sesiones: solo el propio usuario
CREATE POLICY sessions_self ON core.security_sessions
  USING (
    user_id = app.current_uuid('app.current_user_id')
    -- B3: is_superadmin eliminado
  );

-- ── TRIGGERS CORE ─────────────────────────────────────────────
CREATE TRIGGER trg_persons_upd
  BEFORE UPDATE ON core.persons
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_users_upd
  BEFORE UPDATE ON core.users
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_members_upd
  BEFORE UPDATE ON core.members
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_tenants_upd
  BEFORE UPDATE ON core.tenants
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_auth_cred_upd
  BEFORE UPDATE ON core.authentication_credentials
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- Audit triggers
CREATE TRIGGER audit_persons
  AFTER INSERT OR UPDATE OR DELETE ON core.persons
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();
CREATE TRIGGER audit_members
  AFTER INSERT OR UPDATE OR DELETE ON core.members
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();
CREATE TRIGGER audit_auth_credentials
  AFTER INSERT OR UPDATE OR DELETE ON core.authentication_credentials
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();

-- ══════════════════════════════════════════════════════════════
-- B4/B5: ROLES Y POLÍTICAS RLS COMPLETAS — core
-- ══════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE ON core.tenants                  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.tenant_app_variants      TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.tenant_brand_profiles    TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.persons                  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.external_identifiers     TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.users                    TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.authentication_credentials TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.password_reset_tokens    TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.mfa_methods              TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.security_sessions        TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.members                  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.partner_member_records   TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.identity_match_candidates TO app_runtime;
GRANT SELECT, INSERT         ON core.identity_match_decisions TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.member_data_consents     TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON core.member_contacts          TO app_runtime;

GRANT SELECT ON core.tenants, core.members, core.persons TO readonly_support;

ALTER TABLE core.persons              FORCE ROW LEVEL SECURITY;
ALTER TABLE core.users                FORCE ROW LEVEL SECURITY;
ALTER TABLE core.members              FORCE ROW LEVEL SECURITY;
ALTER TABLE core.member_contacts      FORCE ROW LEVEL SECURITY;
ALTER TABLE core.member_data_consents FORCE ROW LEVEL SECURITY;
ALTER TABLE core.security_sessions    FORCE ROW LEVEL SECURITY;
