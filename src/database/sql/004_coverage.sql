-- ============================================================
-- MedTravelApp — Schema SQL v1.2.3
-- 004_coverage.sql
-- CHANGELOG v1.2:
--   B4: FKs reales a params.catalog_values(id)
--   B8: eliminados limit_amount y currency de plan_coverages y assistance_plans
--       Los montos se consultan al partner por API (deep link)
--   B11: vigencia extendida con timezone_rule, territory_scope,
--        status_authority, coverage_without_trip y last_verified_at
-- ============================================================

-- ── PLANES DE ASISTENCIA — B8: sin datos económicos ──────────
CREATE TABLE coverage.assistance_plans (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID         NOT NULL REFERENCES core.tenants(id),
  code              VARCHAR(50)  NOT NULL,
  name              VARCHAR(200) NOT NULL,
  plan_type_id      UUID         NOT NULL REFERENCES params.catalog_values(id),
  coverage_regions  TEXT[],
  max_trip_days     SMALLINT,
  max_age           SMALLINT,
  -- B8: sin currency ni limit_amount
  -- Los montos se consultan al partner por API
  -- El portal muestra deep link a la asistencia para info comercial
  commercial_info_url TEXT,          -- URL del portal del partner para montos
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

-- B8: plan_coverages sin importes — solo descripción de cobertura
CREATE TABLE coverage.plan_coverages (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           UUID         NOT NULL REFERENCES coverage.assistance_plans(id),
  category_id       UUID         NOT NULL REFERENCES params.catalog_values(id),
  name_es           VARCHAR(200) NOT NULL,
  name_en           VARCHAR(200),
  description_es    TEXT         NOT NULL,
  description_en    TEXT,
  -- B8: sin limit_amount ni currency
  -- Indicadores cualitativos de cobertura para mostrar en la app
  coverage_scope    VARCHAR(20)  NOT NULL DEFAULT 'FULL'
                    CHECK (coverage_scope IN ('FULL','PARTIAL','EXCLUDED','CONDITIONAL')),
  requires_auth     BOOLEAN      NOT NULL DEFAULT FALSE,
  notes_es          TEXT,
  display_order     SMALLINT     NOT NULL DEFAULT 0,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── ORIGEN DE COBERTURA ───────────────────────────────────────
CREATE TABLE coverage.coverage_sponsors (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID         NOT NULL REFERENCES core.tenants(id),
  sponsor_type_id   UUID         NOT NULL REFERENCES params.catalog_values(id),
  name              VARCHAR(200) NOT NULL,
  code              VARCHAR(50),
  country_id        UUID         REFERENCES params.catalog_values(id),
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE coverage.card_networks (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  code              VARCHAR(20)  NOT NULL UNIQUE,
  name              VARCHAR(100) NOT NULL,
  logo_url          VARCHAR(500),
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE coverage.card_issuers (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  network_id        UUID         NOT NULL REFERENCES coverage.card_networks(id),
  name              VARCHAR(200) NOT NULL,
  code              VARCHAR(50),
  country_id        UUID         REFERENCES params.catalog_values(id),
  api_profile_id    UUID         REFERENCES params.partner_api_profiles(id),
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE coverage.card_benefit_programs (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer_id         UUID         NOT NULL REFERENCES coverage.card_issuers(id),
  plan_id           UUID         NOT NULL REFERENCES coverage.assistance_plans(id),
  program_name      VARCHAR(200) NOT NULL,
  card_tier_id      UUID         REFERENCES params.catalog_values(id),
  eligibility_rules JSONB        NOT NULL DEFAULT '{}',
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  valid_from        DATE         NOT NULL,
  valid_until       DATE,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── ENROLLMENTS — B11: vigencia extendida ─────────────────────
CREATE TABLE coverage.travel_assistance_enrollments (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id               UUID         NOT NULL REFERENCES core.members(id),
  tenant_id               UUID         NOT NULL REFERENCES core.tenants(id),
  plan_id                 UUID         NOT NULL REFERENCES coverage.assistance_plans(id),
  sponsor_id              UUID         REFERENCES coverage.coverage_sponsors(id),
  policy_number           VARCHAR(100) NOT NULL,

  -- B11: vigencia extendida con precisión de timezone
  valid_from              DATE         NOT NULL,
  valid_until             DATE         NOT NULL,
  -- Zona horaria de corte de vigencia (ej: 'America/Argentina/Buenos_Aires')
  -- La cobertura expira al final del día en esta zona horaria
  timezone_rule           VARCHAR(50)  NOT NULL DEFAULT 'UTC',

  -- B11: alcance territorial de la cobertura
  -- Ej: ['LATAM','EUR'] o ['WORLDWIDE'] o ['AR','BR','UY']
  territory_scope         TEXT[]       NOT NULL DEFAULT ARRAY['WORLDWIDE'],

  -- B11: fuente autoritativa del estado de vigencia
  -- PARTNER_API = se verifica con la API del partner en tiempo real
  -- LOCAL_RECORD = se confía en el registro local hasta la próxima sync
  -- MEMBER_DECLARED = el titular declaró la cobertura sin verificación
  status_authority        VARCHAR(20)  NOT NULL DEFAULT 'LOCAL_RECORD'
                          CHECK (status_authority IN (
                            'PARTNER_API','LOCAL_RECORD','MEMBER_DECLARED'
                          )),

  status_id               UUID         NOT NULL REFERENCES params.catalog_values(id),
  verification_source_id  UUID         REFERENCES params.catalog_values(id),

  -- B11: última verificación y próxima verificación programada
  last_verified_at        TIMESTAMPTZ,
  next_verification_at    TIMESTAMPTZ,
  verification_failure_count SMALLINT  NOT NULL DEFAULT 0,

  -- B11: cobertura sin viaje registrado
  -- Indica si la cobertura aplica aunque el member no haya cargado un viaje
  -- (ej: cobertura anual de tarjeta que no requiere declaración de viaje)
  applies_without_trip    BOOLEAN      NOT NULL DEFAULT FALSE,
  coverage_activation_mode VARCHAR(20) NOT NULL DEFAULT 'TRIP_REQUIRED'
                           CHECK (coverage_activation_mode IN (
                             'TRIP_REQUIRED',    -- requiere viaje registrado
                             'AUTOMATIC',        -- activa automáticamente
                             'DECLARED_TRAVEL'   -- el titular declara que viaja
                           )),

  -- Sync
  sync_status_id          UUID         REFERENCES params.catalog_values(id),
  last_sync_attempt       TIMESTAMPTZ,
  last_sync_success       TIMESTAMPTZ,

  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── CANAL DE ADQUISICIÓN ──────────────────────────────────────
CREATE TABLE coverage.coverage_acquisition_channels (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id       UUID         NOT NULL REFERENCES coverage.travel_assistance_enrollments(id),
  channel_type_id     UUID         NOT NULL REFERENCES params.catalog_values(id),
  sponsor_id          UUID         REFERENCES coverage.coverage_sponsors(id),
  card_network_id     UUID         REFERENCES coverage.card_networks(id),
  card_issuer_id      UUID         REFERENCES coverage.card_issuers(id),
  benefit_program_id  UUID         REFERENCES coverage.card_benefit_programs(id),
  -- Sin PAN, CVV, PIN ni datos financieros completos
  card_last_four      CHAR(4),
  card_expiry_month   SMALLINT     CHECK (card_expiry_month BETWEEN 1 AND 12),
  card_expiry_year    SMALLINT     CHECK (card_expiry_year BETWEEN 2020 AND 2099),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE coverage.member_card_benefit_links (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id               UUID        NOT NULL REFERENCES core.members(id),
  benefit_program_id      UUID        NOT NULL REFERENCES coverage.card_benefit_programs(id),
  enrollment_id           UUID        REFERENCES coverage.travel_assistance_enrollments(id),
  verification_status_id  UUID        NOT NULL REFERENCES params.catalog_values(id),
  verified_at             TIMESTAMPTZ,
  active                  BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── REGLAS Y VERIFICACIONES DE ELEGIBILIDAD ──────────────────
CREATE TABLE coverage.coverage_eligibility_rules (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id           UUID        NOT NULL REFERENCES coverage.assistance_plans(id),
  rule_type_id      UUID        NOT NULL REFERENCES params.catalog_values(id),
  rule_config       JSONB       NOT NULL,
  error_message_es  TEXT,
  error_message_en  TEXT,
  active            BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE coverage.coverage_eligibility_verifications (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id               UUID        NOT NULL REFERENCES core.members(id),
  enrollment_id           UUID        NOT NULL REFERENCES coverage.travel_assistance_enrollments(id),
  verification_type_id    UUID        NOT NULL REFERENCES params.catalog_values(id),
  status_id               UUID        NOT NULL REFERENCES params.catalog_values(id),
  response_data           JSONB       NOT NULL DEFAULT '{}',
  failure_reasons         TEXT[],
  verified_at             TIMESTAMPTZ,
  verified_by_id          UUID,
  -- B11: vigencia del resultado de verificación
  valid_until             TIMESTAMPTZ,
  -- Si falla la sincronización, la cobertura no se marca como vencida
  -- automáticamente — se distingue entre vencida y no verificada
  failure_type            VARCHAR(20) CHECK (failure_type IN (
    'EXPIRED',        -- realmente vencida según el partner
    'SYNC_FAILURE',   -- no se pudo verificar por error de conectividad
    'PLAN_CHANGED',   -- el plan cambió en el partner
    'NOT_FOUND'       -- el partner no encontró el número de póliza
  )),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CERTIFICADOS ──────────────────────────────────────────────
CREATE TABLE coverage.travel_assistance_certificates (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id       UUID         NOT NULL REFERENCES coverage.travel_assistance_enrollments(id),
  member_id           UUID         NOT NULL REFERENCES core.members(id),
  certificate_number  VARCHAR(100) NOT NULL UNIQUE,
  issued_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  valid_from          DATE         NOT NULL,
  valid_until         DATE         NOT NULL,
  -- B11: zona horaria del certificado
  timezone_rule       VARCHAR(50)  NOT NULL DEFAULT 'UTC',
  -- Resumen de coberturas incluidas — sin importes (B8)
  coverage_summary    JSONB        NOT NULL,
  document_url        TEXT,
  document_hash       TEXT,
  language_code       CHAR(5)      NOT NULL DEFAULT 'es',
  status_id           UUID         NOT NULL REFERENCES params.catalog_values(id),
  replaced_by_id      UUID         REFERENCES coverage.travel_assistance_certificates(id),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── COBERTURA MÉDICA HABITUAL ─────────────────────────────────
CREATE TABLE coverage.health_coverages (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         UUID         NOT NULL REFERENCES core.members(id),
  coverage_name     VARCHAR(200) NOT NULL,
  coverage_type_id  UUID         NOT NULL REFERENCES params.catalog_values(id),
  provider_name     VARCHAR(200) NOT NULL,
  policy_number     VARCHAR(100),
  member_number     VARCHAR(100),
  valid_from        DATE,
  valid_until       DATE,
  -- B11: zona horaria de vigencia
  timezone_rule     VARCHAR(50)  NOT NULL DEFAULT 'UTC',
  status_id         UUID         NOT NULL REFERENCES params.catalog_values(id),
  is_primary        BOOLEAN      NOT NULL DEFAULT FALSE,
  country_id        UUID         REFERENCES params.catalog_values(id),
  last_verified_at  TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── SYNC EVENTS ───────────────────────────────────────────────
CREATE TABLE coverage.coverage_sync_events (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id     UUID         NOT NULL REFERENCES coverage.travel_assistance_enrollments(id),
  sync_type_id      UUID         NOT NULL REFERENCES params.catalog_values(id),
  source            VARCHAR(50)  NOT NULL,
  status_id         UUID         NOT NULL REFERENCES params.catalog_values(id),
  changes_detected  JSONB        NOT NULL DEFAULT '{}',
  error_message     TEXT,
  -- B11: diferenciar falla de sync de expiración real
  failure_type      VARCHAR(20)  CHECK (failure_type IN (
    'NETWORK_ERROR','AUTH_ERROR','PARTNER_ERROR','TIMEOUT','UNKNOWN'
  )),
  retry_count       SMALLINT     NOT NULL DEFAULT 0,
  started_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  next_retry_at     TIMESTAMPTZ
);

-- ── ÍNDICES COVERAGE ──────────────────────────────────────────
CREATE INDEX idx_enrollments_member  ON coverage.travel_assistance_enrollments(member_id);
CREATE INDEX idx_enrollments_active  ON coverage.travel_assistance_enrollments(tenant_id, valid_until);  -- índice simple (predicado con subquery no válido en PostgreSQL)
CREATE INDEX idx_enrollments_verify  ON coverage.travel_assistance_enrollments(next_verification_at)
  WHERE next_verification_at IS NOT NULL;
CREATE INDEX idx_health_coverages    ON coverage.health_coverages(member_id, is_primary);
CREATE INDEX idx_certificates        ON coverage.travel_assistance_certificates(enrollment_id);
CREATE INDEX idx_cert_number         ON coverage.travel_assistance_certificates(certificate_number);
CREATE INDEX idx_eligibility_member  ON coverage.coverage_eligibility_verifications(member_id, enrollment_id);
CREATE INDEX idx_sync_pending        ON coverage.coverage_sync_events(next_retry_at)
  WHERE next_retry_at IS NOT NULL;
CREATE INDEX idx_card_links_member   ON coverage.member_card_benefit_links(member_id)
  WHERE active = TRUE;

-- ── RLS COVERAGE — B3: acceso basado en consentimiento ────────
ALTER TABLE coverage.travel_assistance_enrollments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage.health_coverages                ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage.travel_assistance_certificates  ENABLE ROW LEVEL SECURITY;

-- B3: El tenant ve enrollments de sus members
--     El titular (person) ve los suyos propios
--     Acceso clínico individual requiere consentimiento — ver 006_clinical.sql
CREATE POLICY enrollments_access ON coverage.travel_assistance_enrollments
  USING (
    tenant_id = app.current_uuid('app.current_tenant_id')
    OR member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    -- B3: is_superadmin eliminado
  );

CREATE POLICY health_coverages_access ON coverage.health_coverages
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
        OR tenant_id = app.current_uuid('app.current_tenant_id')
    )
    -- B3: is_superadmin eliminado
  );

-- ── TRIGGERS COVERAGE ─────────────────────────────────────────
CREATE TRIGGER trg_enrollments_upd
  BEFORE UPDATE ON coverage.travel_assistance_enrollments
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_health_coverages_upd
  BEFORE UPDATE ON coverage.health_coverages
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

CREATE TRIGGER audit_enrollments
  AFTER INSERT OR UPDATE OR DELETE ON coverage.travel_assistance_enrollments
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();


-- C2: Eliminar políticas anteriores permisivas (anulaban el consentimiento)
DROP POLICY IF EXISTS health_coverages_access ON coverage.health_coverages;
DROP POLICY IF EXISTS member_health_coverages ON coverage.health_coverages;
-- B9/C2: health_coverages — consentimiento obligatorio
-- C7: ENABLE duplicado eliminado
ALTER TABLE coverage.health_coverages FORCE ROW LEVEL SECURITY;
CREATE POLICY hc_select ON coverage.health_coverages
  FOR SELECT TO app_runtime
  USING (
    member_id IN (SELECT id FROM core.members WHERE person_id = app.current_uuid('app.current_person_id'))
    OR (app.current_uuid('app.current_tenant_id') IS NOT NULL AND member_id IN (
        SELECT mdc.member_id FROM core.member_data_consents mdc
        JOIN params.consent_purposes cp ON mdc.purpose_id = cp.id
        JOIN core.members m ON mdc.member_id = m.id
        WHERE m.tenant_id = app.current_uuid('app.current_tenant_id')
          AND mdc.granted = TRUE AND (mdc.valid_until IS NULL OR mdc.valid_until > NOW())
          AND cp.code = 'HEALTH_COVERAGE_ACCESS'))
  );
CREATE POLICY hc_insert ON coverage.health_coverages
  FOR INSERT TO app_runtime
  WITH CHECK (member_id IN (SELECT id FROM core.members WHERE person_id = app.current_uuid('app.current_person_id')));
CREATE POLICY hc_update ON coverage.health_coverages
  FOR UPDATE TO app_runtime
  USING (member_id IN (
    SELECT id FROM core.members
    WHERE person_id = app.current_uuid('app.current_person_id')
  ))
  WITH CHECK (member_id IN (
    SELECT id FROM core.members
    WHERE person_id = app.current_uuid('app.current_person_id')
  ));
CREATE POLICY hc_no_delete ON coverage.health_coverages FOR DELETE TO app_runtime USING (FALSE);

-- ══════════════════════════════════════════════════════════════
-- C3: travel_assistance_certificates — FORCE RLS + políticas completas
-- ══════════════════════════════════════════════════════════════
ALTER TABLE coverage.travel_assistance_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage.travel_assistance_certificates FORCE ROW LEVEL SECURITY;

CREATE POLICY cert_select ON coverage.travel_assistance_certificates
  FOR SELECT TO app_runtime
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    OR enrollment_id IN (
      SELECT id FROM coverage.travel_assistance_enrollments
      WHERE tenant_id = app.current_uuid('app.current_tenant_id')
    )
  );
-- C6: cert_insert valida que enrollment pertenece al tenant activo
CREATE POLICY cert_insert ON coverage.travel_assistance_certificates
  FOR INSERT TO app_runtime
  WITH CHECK (
    enrollment_id IN (
      SELECT id FROM coverage.travel_assistance_enrollments
      WHERE tenant_id = app.current_uuid('app.current_tenant_id')
    )
    AND member_id IN (
      SELECT e.member_id FROM coverage.travel_assistance_enrollments e
      WHERE e.id = enrollment_id
        AND e.tenant_id = app.current_uuid('app.current_tenant_id')
    )
  );
CREATE POLICY cert_no_update ON coverage.travel_assistance_certificates
  FOR UPDATE TO app_runtime USING (FALSE);
CREATE POLICY cert_no_delete ON coverage.travel_assistance_certificates
  FOR DELETE TO app_runtime USING (FALSE);

GRANT SELECT, INSERT ON coverage.travel_assistance_certificates TO app_runtime;
GRANT SELECT ON coverage.travel_assistance_certificates TO readonly_support;
