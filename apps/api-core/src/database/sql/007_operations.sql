-- ============================================================
-- MedTravelApp — Schema SQL v1.2.3
-- 007_operations.sql
-- CHANGELOG v1.2:
--   B9: expires_at en tokens se calcula en runtime desde operational_limits
--       NO hardcodeados en seeds ni en código SQL
--   B10: ELIMINADO trigger duplicado audit_submissions sobre emergency_cases
--        Solo existe audit_cases — un evento por operación
--   B4: FKs reales a params.catalog_values(id)
--   B3: RLS de casos vincula al member, no solo al tenant
-- ============================================================

-- ── EMERGENCY PROFILES ───────────────────────────────────────
CREATE TABLE emergency.profiles (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         UUID         NOT NULL UNIQUE REFERENCES core.members(id),
  show_allergies    BOOLEAN      NOT NULL DEFAULT TRUE,
  show_conditions   BOOLEAN      NOT NULL DEFAULT TRUE,
  show_medications  BOOLEAN      NOT NULL DEFAULT TRUE,
  show_surgeries    BOOLEAN      NOT NULL DEFAULT TRUE,
  show_vaccines     BOOLEAN      NOT NULL DEFAULT FALSE,
  show_morphology   BOOLEAN      NOT NULL DEFAULT TRUE,
  show_contacts     BOOLEAN      NOT NULL DEFAULT TRUE,
  show_insurance    BOOLEAN      NOT NULL DEFAULT TRUE,
  show_lab_summary  BOOLEAN      NOT NULL DEFAULT FALSE,
  personal_note_es  TEXT,
  personal_note_en  TEXT,
  completeness_pct  SMALLINT     NOT NULL DEFAULT 0
                    CHECK (completeness_pct BETWEEN 0 AND 100),
  last_reviewed_at  TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── EMERGENCY TOKENS — expires_at NOT NULL (MTA-511) ─────────
-- B9: El TTL se calcula en la capa de aplicación leyendo operational_limits
--     NestJS: const ttl = await getLimit('TOKEN_DYNAMIC_QR_TTL_SECONDS')
--     Aquí solo se garantiza que expires_at nunca sea NULL
CREATE TABLE emergency.tokens (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         UUID         NOT NULL REFERENCES core.members(id),
  token_type_id     UUID         NOT NULL REFERENCES params.catalog_values(id),
  token_value       TEXT         NOT NULL UNIQUE,
  token_hash        TEXT         NOT NULL,
  access_url        TEXT         NOT NULL,
  -- MTA-511 + B9: NOT NULL siempre; TTL calculado en runtime desde params
  expires_at        TIMESTAMPTZ  NOT NULL,
  max_uses          SMALLINT,
  use_count         SMALLINT     NOT NULL DEFAULT 0,
  status_id         UUID         NOT NULL REFERENCES params.catalog_values(id),
  notify_on_use     BOOLEAN      NOT NULL DEFAULT TRUE,
  scope             TEXT[]       NOT NULL DEFAULT ARRAY[
    'critical_allergies','critical_conditions',
    'current_medications','emergency_contacts'
  ],
  generated_offline BOOLEAN      NOT NULL DEFAULT FALSE,
  device_id         TEXT,
  recipient_name    TEXT,
  recipient_email   TEXT,
  recipient_type_id UUID         REFERENCES params.catalog_values(id),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- MTA-511: acceso offline firmado con vencimiento obligatorio
-- B9: expires_at calculado en runtime desde operational_limits
CREATE TABLE emergency.signed_offline_access (
  id                           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id                    UUID         NOT NULL REFERENCES core.members(id),
  signed_payload               TEXT         NOT NULL,
  signature                    TEXT         NOT NULL,
  -- B9: TTL desde operational_limits.TOKEN_OFFLINE_ACCESS_MAX_HOURS
  expires_at                   TIMESTAMPTZ  NOT NULL,
  last_sync_at                 TIMESTAMPTZ,
  show_sync_warning            BOOLEAN      NOT NULL DEFAULT FALSE,
  -- B9: umbral desde operational_limits.OFFLINE_SYNC_WARNING_HOURS
  sync_warning_threshold_hours SMALLINT     NOT NULL DEFAULT 24,
  status_id                    UUID         NOT NULL REFERENCES params.catalog_values(id),
  created_at                   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  revoked_at                   TIMESTAMPTZ,
  revoke_reason                TEXT
);

-- Access log inmutable
CREATE TABLE emergency.access_log (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id            UUID         REFERENCES emergency.tokens(id),
  member_id           UUID         NOT NULL REFERENCES core.members(id),
  accessor_type_id    UUID         NOT NULL REFERENCES params.catalog_values(id),
  accessor_name       TEXT,
  accessor_email      TEXT,
  accessor_specialty  TEXT,
  accessor_company    TEXT,
  access_ip           INET,
  access_country      CHAR(2),
  access_city         TEXT,
  device_type_id      UUID         REFERENCES params.catalog_values(id),
  access_method_id    UUID         NOT NULL REFERENCES params.catalog_values(id),
  sections_viewed     TEXT[],
  documents_viewed    UUID[],
  view_duration_sec   INTEGER,
  display_language    CHAR(5),
  was_translated      BOOLEAN      NOT NULL DEFAULT FALSE,
  access_granted      BOOLEAN      NOT NULL,
  denial_reason       TEXT,
  doctor_left_note    BOOLEAN      NOT NULL DEFAULT FALSE,
  accessed_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  -- Inmutable
);

CREATE TABLE emergency.token_usage_log (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id                  UUID         REFERENCES emergency.tokens(id),
  token_value_attempted     TEXT,
  check_token_exists        BOOLEAN,
  check_not_expired         BOOLEAN,
  check_not_revoked         BOOLEAN,
  check_hmac_valid          BOOLEAN,
  check_replay              BOOLEAN,
  access_granted            BOOLEAN      NOT NULL,
  denial_reason             TEXT,
  attempt_ip                INET,
  attempt_country           CHAR(2),
  user_agent                TEXT,
  attempted_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  -- Inmutable
);

-- ── VIAJES ───────────────────────────────────────────────────
CREATE TABLE operations.trips (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         UUID         NOT NULL REFERENCES core.members(id),
  enrollment_id     UUID         REFERENCES coverage.travel_assistance_enrollments(id),
  trip_name         TEXT,
  trip_start        DATE         NOT NULL,
  trip_end          DATE         NOT NULL,
  status_id         UUID         NOT NULL REFERENCES params.catalog_values(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CHECK (trip_end >= trip_start)
);

CREATE TABLE operations.trip_destinations (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id               UUID         NOT NULL REFERENCES operations.trips(id),
  member_id             UUID         NOT NULL REFERENCES core.members(id),
  country_id            UUID         NOT NULL REFERENCES params.catalog_values(id),
  city                  TEXT         NOT NULL,
  address               TEXT,
  latitude              NUMERIC(10,8),
  longitude             NUMERIC(11,8),
  arrival_date          DATE         NOT NULL,
  departure_date        DATE         NOT NULL,
  sequence_order        SMALLINT     NOT NULL,
  status_id             UUID         NOT NULL REFERENCES params.catalog_values(id),
  ai_alerts_generated   BOOLEAN      NOT NULL DEFAULT FALSE,
  ai_alerts             JSONB        NOT NULL DEFAULT '[]',
  ai_alerts_seen        BOOLEAN      NOT NULL DEFAULT FALSE,
  health_risks          TEXT[],
  requires_vaccine      BOOLEAN      NOT NULL DEFAULT FALSE,
  vaccine_required_name TEXT,
  local_emergency_info  JSONB        NOT NULL DEFAULT '{}',
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, sequence_order),
  CHECK (departure_date >= arrival_date)
);

-- ── CASOS DE EMERGENCIA ───────────────────────────────────────
CREATE TABLE operations.emergency_cases (
  id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number               TEXT         NOT NULL UNIQUE
                            DEFAULT operations.generate_case_number(),
  member_id                 UUID         NOT NULL REFERENCES core.members(id),
  tenant_id                 UUID         NOT NULL REFERENCES core.tenants(id),
  enrollment_id             UUID         REFERENCES coverage.travel_assistance_enrollments(id),
  trip_id                   UUID         REFERENCES operations.trips(id),
  destination_id            UUID         REFERENCES operations.trip_destinations(id),
  destination_detected_by_id UUID        REFERENCES params.catalog_values(id),
  origin_id                 UUID         NOT NULL REFERENCES params.catalog_values(id),
  emergency_type_id         UUID         REFERENCES params.catalog_values(id),
  priority_id               UUID         NOT NULL REFERENCES params.catalog_values(id),
  status_id                 UUID         NOT NULL REFERENCES params.catalog_values(id),
  initial_description       TEXT,
  patient_symptoms          TEXT,
  patient_conscious         BOOLEAN,
  incident_latitude         NUMERIC(10,8),
  incident_longitude        NUMERIC(11,8),
  incident_location_acc     NUMERIC(6,2),
  location_source_id        UUID         REFERENCES params.catalog_values(id),
  assigned_operator_id      UUID,
  assigned_at               TIMESTAMPTZ,
  first_response_at         TIMESTAMPTZ,
  -- B9: SLA leído de operational_limits.CASE_SLA_FIRST_RESPONSE_SECONDS
  -- B11: sla_target_seconds sin DEFAULT — se llena por trigger desde operational_limits
  sla_target_seconds        INTEGER,
  resolution_type_id        UUID         REFERENCES params.catalog_values(id),
  resolution_notes          TEXT,
  resolved_at               TIMESTAMPTZ,
  closed_at                 TIMESTAMPTZ,
  closed_by                 UUID,
  -- B2: estimated_cost_usd, authorized_amount_usd eliminados
  -- Los importes se gestionan en el sistema del partner
  created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE operations.case_participants (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id               UUID         NOT NULL REFERENCES operations.emergency_cases(id),
  participant_type_id   UUID         NOT NULL REFERENCES params.catalog_values(id),
  member_id             UUID         REFERENCES core.members(id),
  operator_id           UUID,
  external_name         TEXT,
  external_email        TEXT,
  display_name          TEXT         NOT NULL,
  can_send_messages     BOOLEAN      NOT NULL DEFAULT TRUE,
  can_send_files        BOOLEAN      NOT NULL DEFAULT TRUE,
  can_close_case        BOOLEAN      NOT NULL DEFAULT FALSE,
  can_authorize_expenses BOOLEAN     NOT NULL DEFAULT FALSE,
  can_view_medical      BOOLEAN      NOT NULL DEFAULT TRUE,
  joined_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  left_at               TIMESTAMPTZ,
  is_active             BOOLEAN      NOT NULL DEFAULT TRUE,
  last_seen_at          TIMESTAMPTZ,
  notification_sent     BOOLEAN      NOT NULL DEFAULT FALSE,
  notified_at           TIMESTAMPTZ
);

CREATE TABLE operations.case_status_history (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id             UUID         NOT NULL REFERENCES operations.emergency_cases(id),
  status_from         UUID         REFERENCES params.catalog_values(id),
  status_to           UUID         NOT NULL REFERENCES params.catalog_values(id),
  priority_from       UUID         REFERENCES params.catalog_values(id),
  priority_to         UUID         REFERENCES params.catalog_values(id),
  changed_by_type_id  UUID         REFERENCES params.catalog_values(id),
  changed_by_id       UUID,
  changed_by_name     TEXT,
  reason              TEXT,
  changed_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  -- Inmutable
);

CREATE TABLE operations.case_location_history (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID         NOT NULL REFERENCES operations.emergency_cases(id),
  member_id         UUID         NOT NULL REFERENCES core.members(id),
  latitude          NUMERIC(10,8) NOT NULL,
  longitude         NUMERIC(11,8) NOT NULL,
  accuracy_meters   NUMERIC(6,2),
  battery_pct       SMALLINT     CHECK (battery_pct BETWEEN 0 AND 100),
  has_internet      BOOLEAN,
  recorded_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  -- Inmutable
);

CREATE TABLE operations.case_medical_events (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id               UUID         NOT NULL REFERENCES operations.emergency_cases(id),
  member_id             UUID         NOT NULL REFERENCES core.members(id),
  event_type_id         UUID         NOT NULL REFERENCES params.catalog_values(id),
  description           TEXT         NOT NULL,
  performed_by          TEXT,
  institution_name      TEXT,
  country_id            UUID         REFERENCES params.catalog_values(id),
  -- B2: expense_amount, expense_currency eliminados
  expense_doc_id        UUID         REFERENCES clinical.documents(id),
  vitals_snapshot       JSONB,
  medication_given      TEXT,
  creates_clinical_record BOOLEAN    NOT NULL DEFAULT FALSE,
  registered_by_id      UUID,
  event_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE operations.case_sla_log (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id           UUID         NOT NULL REFERENCES operations.emergency_cases(id),
  tenant_id         UUID         REFERENCES core.tenants(id),
  sla_type_id       UUID         NOT NULL REFERENCES params.catalog_values(id),
  target_seconds    INTEGER      NOT NULL,
  started_at        TIMESTAMPTZ  NOT NULL,
  completed_at      TIMESTAMPTZ,
  actual_seconds    INTEGER,
  met_sla           BOOLEAN,
  breach_seconds    INTEGER,
  breach_reason     TEXT,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── CHAT ─────────────────────────────────────────────────────
CREATE TABLE operations.chat_channels (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id               UUID         NOT NULL REFERENCES operations.emergency_cases(id),
  member_id             UUID         NOT NULL REFERENCES core.members(id),
  channel_type_id       UUID         NOT NULL REFERENCES params.catalog_values(id),
  status_id             UUID         NOT NULL REFERENCES params.catalog_values(id),
  allow_files           BOOLEAN      NOT NULL DEFAULT TRUE,
  auto_translate        BOOLEAN      NOT NULL DEFAULT TRUE,
  pinned_message_id     UUID,
  message_count         INTEGER      NOT NULL DEFAULT 0,
  last_message_at       TIMESTAMPTZ,
  last_message_preview  TEXT,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE operations.chat_messages (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id            UUID         NOT NULL REFERENCES operations.chat_channels(id),
  case_id               UUID         NOT NULL REFERENCES operations.emergency_cases(id),
  sender_type_id        UUID         NOT NULL REFERENCES params.catalog_values(id),
  sender_id             UUID,
  sender_name           TEXT         NOT NULL,
  sender_company        TEXT,
  message_type_id       UUID         NOT NULL REFERENCES params.catalog_values(id),
  content               TEXT,
  content_language      CHAR(5),
  reply_to_id           UUID         REFERENCES operations.chat_messages(id),
  reply_preview         TEXT,
  has_attachments       BOOLEAN      NOT NULL DEFAULT FALSE,
  attachment_count      SMALLINT     NOT NULL DEFAULT 0,
  location_lat          NUMERIC(10,8),
  location_lng          NUMERIC(11,8),
  location_address      TEXT,
  status_id             UUID         NOT NULL REFERENCES params.catalog_values(id),
  is_hidden             BOOLEAN      NOT NULL DEFAULT FALSE,
  hidden_at             TIMESTAMPTZ,
  hidden_by             UUID,
  hidden_reason         TEXT,
  creates_medical_event BOOLEAN      NOT NULL DEFAULT FALSE,
  system_event_type_id  UUID         REFERENCES params.catalog_values(id),
  system_event_data     JSONB,
  sent_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  delivered_at          TIMESTAMPTZ,
  read_by_all_at        TIMESTAMPTZ
);

CREATE TABLE operations.message_attachments (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id            UUID         NOT NULL REFERENCES operations.chat_messages(id),
  channel_id            UUID         NOT NULL REFERENCES operations.chat_channels(id),
  member_id             UUID         NOT NULL REFERENCES core.members(id),
  file_name_original    TEXT         NOT NULL,
  file_name_storage     TEXT         NOT NULL,
  file_extension        VARCHAR(10)  NOT NULL,
  file_size_bytes       INTEGER      NOT NULL CHECK (file_size_bytes > 0),
  file_hash_sha256      TEXT         NOT NULL,
  mime_type             VARCHAR(100) NOT NULL,
  storage_path          TEXT         NOT NULL,
  is_encrypted          BOOLEAN      NOT NULL DEFAULT TRUE,
  document_type_id      UUID         REFERENCES params.catalog_values(id),
  saved_to_history      BOOLEAN      NOT NULL DEFAULT FALSE,
  clinical_doc_id       UUID         REFERENCES clinical.documents(id),
  saved_at              TIMESTAMPTZ,
  thumbnail_url         TEXT,
  duration_seconds      SMALLINT,
  status_id             UUID         NOT NULL REFERENCES params.catalog_values(id),
  uploaded_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE operations.message_reads (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id        UUID         NOT NULL REFERENCES operations.chat_messages(id),
  channel_id        UUID         NOT NULL REFERENCES operations.chat_channels(id),
  reader_type_id    UUID         NOT NULL REFERENCES params.catalog_values(id),
  reader_id         UUID         NOT NULL,
  read_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, reader_id)
);

CREATE TABLE operations.chat_translations (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id            UUID         NOT NULL REFERENCES operations.chat_messages(id),
  source_language       CHAR(5)      NOT NULL,
  target_language       CHAR(5)      NOT NULL,
  translated_content    TEXT         NOT NULL,
  translation_model     VARCHAR(50),
  confidence_score      NUMERIC(4,3) CHECK (confidence_score BETWEEN 0 AND 1),
  tokens_used           INTEGER,
  -- B2: cost_usd eliminado de chat_translations
  translated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (message_id, target_language)
);

-- ── OPERADORES ────────────────────────────────────────────────
CREATE TABLE operations.operator_roles (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID         REFERENCES core.tenants(id),
  code                    VARCHAR(50)  NOT NULL,
  name_es                 VARCHAR(100) NOT NULL,
  name_en                 VARCHAR(100),
  description_es          TEXT,
  level                   SMALLINT     NOT NULL DEFAULT 1,
  parent_role_id          UUID         REFERENCES operations.operator_roles(id),
  max_concurrent_cases    SMALLINT     NOT NULL DEFAULT 3,
  can_create_cases        BOOLEAN      NOT NULL DEFAULT FALSE,
  can_close_cases         BOOLEAN      NOT NULL DEFAULT FALSE,
  can_escalate_cases      BOOLEAN      NOT NULL DEFAULT FALSE,
  can_authorize_expenses  BOOLEAN      NOT NULL DEFAULT FALSE,
  can_access_medical      BOOLEAN      NOT NULL DEFAULT FALSE,
  can_manage_operators    BOOLEAN      NOT NULL DEFAULT FALSE,
  can_view_reports        BOOLEAN      NOT NULL DEFAULT FALSE,
  can_manage_config       BOOLEAN      NOT NULL DEFAULT FALSE,
  module_access           TEXT[],
  active                  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE operations.operators (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID         REFERENCES core.tenants(id),
  role_id               UUID         NOT NULL REFERENCES operations.operator_roles(id),
  -- B7: operadores también usan core.users para autenticación
  user_id               UUID         NOT NULL UNIQUE REFERENCES core.users(id),
  first_name            TEXT         NOT NULL,
  last_name             TEXT         NOT NULL,
  operator_type_id      UUID         NOT NULL REFERENCES params.catalog_values(id),
  specialty_id          UUID         REFERENCES params.catalog_values(id),
  license_number        TEXT,
  license_country_id    UUID         REFERENCES params.catalog_values(id),
  languages             TEXT[]       NOT NULL DEFAULT ARRAY['es'],
  timezone              VARCHAR(50)  NOT NULL DEFAULT 'America/Argentina/Buenos_Aires',
  status_id             UUID         NOT NULL REFERENCES params.catalog_values(id),
  presence_status_id    UUID         REFERENCES params.catalog_values(id),
  active_cases_count    SMALLINT     NOT NULL DEFAULT 0,
  max_cases             SMALLINT     NOT NULL DEFAULT 3,
  avatar_url            VARCHAR(500),
  last_seen_at          TIMESTAMPTZ,
  created_by            UUID         REFERENCES operations.operators(id),
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE operations.operator_sessions (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id       UUID         NOT NULL REFERENCES operations.operators(id),
  -- B6: tokens almacenados como hash
  session_token     TEXT         NOT NULL UNIQUE,
  refresh_token     TEXT         UNIQUE,
  device_type_id    UUID         REFERENCES params.catalog_values(id),
  device_name       TEXT,
  ip_address        INET,
  user_agent        TEXT,
  country_detected  CHAR(2),
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- B9: TTL desde operational_limits
  expires_at        TIMESTAMPTZ  NOT NULL,
  last_activity_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
  revoked_at        TIMESTAMPTZ
);

CREATE TABLE operations.operator_presence (
  operator_id         UUID         PRIMARY KEY REFERENCES operations.operators(id),
  tenant_id           UUID         REFERENCES core.tenants(id),
  operator_type_id    UUID         REFERENCES params.catalog_values(id),
  status_id           UUID         NOT NULL REFERENCES params.catalog_values(id),
  active_cases_count  SMALLINT     NOT NULL DEFAULT 0,
  max_cases           SMALLINT     NOT NULL DEFAULT 3,
  languages           TEXT[],
  last_seen_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  status_updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE operations.operator_audit_log (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  operator_id       UUID         NOT NULL REFERENCES operations.operators(id),
  tenant_id         UUID         REFERENCES core.tenants(id),
  action_type_id    UUID         NOT NULL REFERENCES params.catalog_values(id),
  resource_type_id  UUID         REFERENCES params.catalog_values(id),
  resource_id       UUID,
  resource_preview  TEXT,
  case_id           UUID         REFERENCES operations.emergency_cases(id),
  member_id         UUID         REFERENCES core.members(id),
  ip_address        INET,
  user_agent        TEXT,
  session_id        UUID         REFERENCES operations.operator_sessions(id),
  success           BOOLEAN      NOT NULL DEFAULT TRUE,
  error_message     TEXT,
  data_before       JSONB,
  data_after        JSONB,
  performed_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  -- Inmutable
);

-- ── PORTAL B2B ────────────────────────────────────────────────
CREATE TABLE operations.tenant_analytics_cache (
  id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID         NOT NULL REFERENCES core.tenants(id),
  member_id               UUID         NOT NULL REFERENCES core.members(id),
  policy_number           VARCHAR(100),
  display_name            TEXT,        -- iniciales por defecto
  plan_code               VARCHAR(100),
  app_status_id           UUID         REFERENCES params.catalog_values(id),
  history_completeness_pct SMALLINT,
  residence_country_id    UUID         REFERENCES params.catalog_values(id),
  age_range               VARCHAR(10), -- '31-45' — nunca fecha exacta
  gender                  CHAR(1),
  last_trip_country_id    UUID         REFERENCES params.catalog_values(id),
  last_trip_date          DATE,
  active_case_id          UUID,
  last_sync_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, member_id)
);

-- MTA-511: sin modo SUPERADMIN
CREATE TABLE operations.tenant_access_requests (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID         NOT NULL REFERENCES core.tenants(id),
  member_id             UUID         NOT NULL REFERENCES core.members(id),
  requested_by          UUID         NOT NULL REFERENCES operations.operators(id),
  request_reason        TEXT         NOT NULL,
  status_id             UUID         NOT NULL REFERENCES params.catalog_values(id),
  -- MTA-511: solo USER_CONFIRMED o SYSTEM_ACTIVE_ON_CASE
  -- SUPERADMIN eliminado
  approved_by_type_id   UUID         NOT NULL REFERENCES params.catalog_values(id),
  approved_by_id        UUID,
  scope_id              UUID         REFERENCES params.catalog_values(id),
  case_id               UUID         REFERENCES operations.emergency_cases(id),
  -- B9: TTL desde operational_limits
  valid_until           TIMESTAMPTZ,
  notification_sent_at  TIMESTAMPTZ,
  member_response_at    TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at           TIMESTAMPTZ
);

-- ── ÍNDICES OPERATIONS ────────────────────────────────────────
-- Emergency tokens
CREATE INDEX idx_tokens_member    ON emergency.tokens(member_id);  -- índice simple (predicado con subquery no válido en PostgreSQL)
CREATE INDEX idx_tokens_expiry    ON emergency.tokens(expires_at);  -- índice simple (predicado con subquery no válido en PostgreSQL)
CREATE INDEX idx_access_log_member ON emergency.access_log(member_id, accessed_at DESC);
CREATE INDEX idx_token_usage_fail  ON emergency.token_usage_log(attempt_ip, attempted_at DESC)
  WHERE access_granted = FALSE;
CREATE INDEX idx_offline_member    ON emergency.signed_offline_access(member_id)
  WHERE revoked_at IS NULL;

-- Trips
CREATE INDEX idx_trips_member      ON operations.trips(member_id, trip_start);
CREATE INDEX idx_destinations_trip ON operations.trip_destinations(trip_id, sequence_order);

-- Cases
CREATE INDEX idx_cases_tenant_open ON operations.emergency_cases(tenant_id, priority_id, created_at DESC);
CREATE INDEX idx_cases_unassigned  ON operations.emergency_cases(created_at)
  WHERE assigned_operator_id IS NULL;
CREATE INDEX idx_case_participants ON operations.case_participants(case_id)
  WHERE is_active = TRUE;

-- Chat
CREATE INDEX idx_messages_channel  ON operations.chat_messages(channel_id, sent_at ASC)
  WHERE is_hidden = FALSE;
CREATE INDEX idx_message_reads     ON operations.message_reads(message_id, reader_id);

-- Operators
CREATE INDEX idx_operators_tenant  ON operations.operators(tenant_id, status_id);
CREATE INDEX idx_operators_user    ON operations.operators(user_id);
-- B1: índice parcial con NOW() eliminado
-- El campo is_online (BOOLEAN) es actualizado por heartbeat cada 30s
-- El filtro temporal se aplica en la query, no en el índice
-- Asegurar campo is_online existe
ALTER TABLE operations.operator_presence
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_presence_online ON operations.operator_presence(is_online, operator_type_id)
  WHERE is_online = TRUE;
CREATE INDEX idx_presence_lastseen ON operations.operator_presence(tenant_id, last_seen_at DESC);
CREATE INDEX idx_analytics_tenant  ON operations.tenant_analytics_cache(tenant_id, app_status_id);
CREATE INDEX idx_access_req_pending ON operations.tenant_access_requests(tenant_id, status_id)
  WHERE resolved_at IS NULL;

-- ── RLS OPERATIONS — B3: corregido ───────────────────────────
ALTER TABLE emergency.tokens               ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations.emergency_cases     ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations.chat_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations.tenant_analytics_cache ENABLE ROW LEVEL SECURITY;

-- Tokens: el titular ve los suyos; el tenant ve los de sus members
-- B10: tokens solo visibles al TITULAR — el tenant NO ve tokens por padrón
CREATE POLICY tokens_titular ON emergency.tokens
  FOR SELECT TO app_runtime
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    OR member_id IN (
      SELECT ec.member_id FROM operations.emergency_cases ec
      WHERE ec.id = app.current_uuid('app.active_case_id')
        AND ec.tenant_id = app.current_uuid('app.current_tenant_id')
    )
  );
CREATE POLICY tokens_insert ON emergency.tokens
  FOR INSERT TO app_runtime
  WITH CHECK (member_id IN (
    SELECT id FROM core.members
    WHERE person_id = app.current_uuid('app.current_person_id')
  ));
-- C5: tokens_update duplicado eliminado (ver política completa arriba)
CREATE POLICY tokens_no_delete ON emergency.tokens
  FOR DELETE TO app_runtime USING (FALSE);

-- B3: Casos: tenant ve sus casos; titular ve los suyos
CREATE POLICY cases_access ON operations.emergency_cases
  USING (
    tenant_id = app.current_uuid('app.current_tenant_id')
    OR member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    -- B3: is_superadmin eliminado — break-glass en audit.break_glass_grants
  );

-- Analytics: solo el tenant ve su propio cache
CREATE POLICY analytics_tenant ON operations.tenant_analytics_cache
  USING (
    tenant_id = app.current_uuid('app.current_tenant_id')
    -- B3: is_superadmin eliminado — break-glass en audit.break_glass_grants
  );

-- ── TRIGGERS OPERATIONS ───────────────────────────────────────
CREATE TRIGGER trg_cases_upd
  BEFORE UPDATE ON operations.emergency_cases
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_channels_upd
  BEFORE UPDATE ON operations.chat_channels
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_operators_upd
  BEFORE UPDATE ON operations.operators
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_trips_upd
  BEFORE UPDATE ON operations.trips
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
CREATE TRIGGER trg_access_req_upd
  BEFORE UPDATE ON operations.tenant_access_requests
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- Log automático de cambio de estado del caso
CREATE OR REPLACE FUNCTION operations.log_case_status_change()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status_id IS DISTINCT FROM NEW.status_id
  OR OLD.priority_id IS DISTINCT FROM NEW.priority_id THEN
    INSERT INTO operations.case_status_history (
      case_id, status_from, status_to, priority_from, priority_to,
      changed_by_type_id, changed_by_id, changed_at
    ) VALUES (
      NEW.id, OLD.status_id, NEW.status_id,
      OLD.priority_id, NEW.priority_id,
      params.catalog_id('CHANGED_BY_TYPE','SYSTEM'),
      NULL, NOW()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_case_status_history
  AFTER UPDATE OF status_id, priority_id ON operations.emergency_cases
  FOR EACH ROW EXECUTE FUNCTION operations.log_case_status_change();

-- B10: UN SOLO trigger de audit sobre emergency_cases
-- ELIMINADO: audit_submissions (que estaba duplicado sobre esta tabla)
CREATE TRIGGER audit_cases
  AFTER INSERT OR UPDATE OR DELETE ON operations.emergency_cases
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();
-- (No hay audit_submissions aquí — ese trigger existe en 006_professionals.sql
--  sobre clinical.encounter_submissions, que es la tabla correcta)

-- ══════════════════════════════════════════════════════════════
-- B4/B5: ROLES Y FORCE RLS — operations/emergency
-- ══════════════════════════════════════════════════════════════
ALTER TABLE emergency.tokens               FORCE ROW LEVEL SECURITY;
ALTER TABLE operations.emergency_cases     FORCE ROW LEVEL SECURITY;
ALTER TABLE operations.tenant_analytics_cache FORCE ROW LEVEL SECURITY;
ALTER TABLE coverage.health_coverages      FORCE ROW LEVEL SECURITY;

-- B11: Trigger para sla_target_seconds desde operational_limits
CREATE OR REPLACE FUNCTION operations.fill_sla_target()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, operations, params
AS $$
BEGIN
  IF NEW.sla_target_seconds IS NULL THEN
    SELECT limit_value INTO NEW.sla_target_seconds
    FROM params.operational_limits
    WHERE limit_key = 'CASE_SLA_FIRST_RESPONSE_SECONDS'
      AND tenant_id IS NULL AND lifecycle_status = 'ACTIVE' LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION operations.fill_sla_target() FROM PUBLIC;
CREATE TRIGGER trg_case_sla_target
  BEFORE INSERT ON operations.emergency_cases
  FOR EACH ROW EXECUTE FUNCTION operations.fill_sla_target();

-- GRANTS operations
GRANT SELECT, INSERT, UPDATE ON operations.trips              TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON operations.trip_destinations  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON operations.emergency_cases    TO app_runtime;
GRANT SELECT, INSERT         ON operations.case_participants  TO app_runtime;
GRANT SELECT, INSERT         ON operations.case_status_history TO app_runtime;
GRANT SELECT, INSERT         ON operations.case_location_history TO app_runtime;
GRANT SELECT, INSERT         ON operations.case_medical_events TO app_runtime;
GRANT SELECT, INSERT         ON operations.case_sla_log       TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON operations.chat_channels      TO app_runtime;

-- ══════════════════════════════════════════════════════════════
-- C4: chat_messages — políticas basadas en membresía de canal
-- ══════════════════════════════════════════════════════════════
ALTER TABLE operations.chat_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: participante activo del caso puede leer mensajes
CREATE POLICY msg_select ON operations.chat_messages
  FOR SELECT TO app_runtime
  USING (
    case_id IN (
      SELECT ec.id FROM operations.emergency_cases ec
      WHERE ec.tenant_id = app.current_uuid('app.current_tenant_id')
        OR ec.member_id IN (
          SELECT id FROM core.members
          WHERE person_id = app.current_uuid('app.current_person_id')
        )
    )
    AND channel_id IN (
      SELECT ch.id FROM operations.chat_channels ch
      JOIN operations.case_participants cp ON cp.case_id = ch.case_id
      WHERE cp.is_active = TRUE
        AND (
          cp.member_id IN (
            SELECT id FROM core.members
            WHERE person_id = app.current_uuid('app.current_person_id')
          )
          OR cp.operator_id = app.current_uuid('app.current_user_id')
        )
    )
  );

-- INSERT: participante activo con can_send_messages = TRUE
CREATE POLICY msg_insert ON operations.chat_messages
  FOR INSERT TO app_runtime
  WITH CHECK (
    channel_id IN (
      SELECT ch.id FROM operations.chat_channels ch
      JOIN operations.case_participants cp ON cp.case_id = ch.case_id
      WHERE cp.is_active = TRUE
        AND cp.can_send_messages = TRUE
        AND (
          cp.member_id IN (
            SELECT id FROM core.members
            WHERE person_id = app.current_uuid('app.current_person_id')
          )
          OR cp.operator_id = app.current_uuid('app.current_user_id')
        )
    )
  );

-- UPDATE: no se editan mensajes (inmutables)
CREATE POLICY msg_no_update ON operations.chat_messages
  FOR UPDATE TO app_runtime USING (FALSE);

-- DELETE: nunca
CREATE POLICY msg_no_delete ON operations.chat_messages
  FOR DELETE TO app_runtime USING (FALSE);

GRANT SELECT, INSERT         ON operations.chat_messages      TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON operations.message_attachments TO app_runtime;
GRANT SELECT, INSERT         ON operations.message_reads      TO app_runtime;
GRANT SELECT, INSERT         ON operations.chat_translations  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON operations.operator_roles     TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON operations.operators          TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON operations.operator_sessions  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON operations.operator_presence  TO app_runtime;
GRANT SELECT, INSERT         ON operations.operator_audit_log TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON operations.tenant_analytics_cache TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON operations.tenant_access_requests TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON emergency.tokens              TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON emergency.signed_offline_access TO app_runtime;
GRANT SELECT                 ON emergency.access_log          TO app_runtime;
GRANT SELECT                 ON emergency.token_usage_log     TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON emergency.profiles            TO app_runtime;

GRANT SELECT ON operations.emergency_cases, operations.case_participants,
               operations.chat_channels, operations.chat_messages,
               operations.trips, operations.trip_destinations,
               operations.operators, operations.operator_roles
  TO readonly_support;

-- C10: tenant_id y member_id inmutables en emergency_cases
CREATE OR REPLACE FUNCTION operations.deny_case_ownership_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, operations AS $$
BEGIN
  IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'tenant_id es inmutable en emergency_cases';
  END IF;
  IF OLD.member_id IS DISTINCT FROM NEW.member_id THEN
    RAISE EXCEPTION 'member_id es inmutable en emergency_cases';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION operations.deny_case_ownership_change() FROM PUBLIC;

CREATE TRIGGER trg_cases_ownership_immutable
  BEFORE UPDATE OF tenant_id, member_id ON operations.emergency_cases
  FOR EACH ROW EXECUTE FUNCTION operations.deny_case_ownership_change();
