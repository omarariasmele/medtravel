-- ============================================================
-- MedTravelApp — Schema SQL v1.2.3
-- 001_audit.sql
-- CHANGELOG v1.2:
--   B5: tabla audit_events rediseñada — sin copia de PII completa,
--       solo diff de campos, con tenant_id/IP/propósito/autorización
--   B5: trigger DENY_MODIFICATION protege contra UPDATE/DELETE
--   C4: archive, anonymization, suppression sin cambios
-- ============================================================

-- ── Audit log inmutable ───────────────────────────────────────
CREATE TABLE audit.data_audit_events (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_schema          VARCHAR(50)  NOT NULL,
  table_name            VARCHAR(100) NOT NULL,
  operation             VARCHAR(10)  NOT NULL
                        CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  row_id                UUID,

  -- B5: Para INSERT → new_data (sin PII)
  --     Para DELETE → old_data (sin PII)
  --     Para UPDATE → changed_fields (solo diff de campos que cambiaron)
  --     Campos PII aparecen como [REDACTED] en todos los casos
  old_data              JSONB,        -- INSERT: NULL; DELETE: registro sin PII
  new_data              JSONB,        -- DELETE: NULL; INSERT: registro sin PII
  changed_fields        JSONB,        -- UPDATE: {"field":{"from":x,"to":y}}

  -- B5: Contexto completo de auditoría
  performed_by          UUID,         -- user_id o operator_id
  tenant_id             UUID,         -- contexto RLS activo
  session_id            TEXT,         -- session token hash (no el token completo)
  ip_address            INET,         -- IP del cliente
  access_purpose        TEXT,         -- propósito declarado del acceso
  authorization_context TEXT,         -- contexto de autorización (rol, caso, etc.)

  performed_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
  -- Sin updated_at — append only
);

-- B5: Proteger audit contra modificación
-- Trigger BEFORE UPDATE y BEFORE DELETE que lanza excepción
CREATE TRIGGER deny_audit_update
  BEFORE UPDATE ON audit.data_audit_events
  FOR EACH ROW EXECUTE FUNCTION audit.deny_modification();

CREATE TRIGGER deny_audit_delete
  BEFORE DELETE ON audit.data_audit_events
  FOR EACH ROW EXECUTE FUNCTION audit.deny_modification();

-- Revocar permisos de UPDATE y DELETE a todos los roles no superuser
-- (ejecutar como superuser durante el setup)
-- REVOKE UPDATE, DELETE ON audit.data_audit_events FROM PUBLIC;
-- GRANT INSERT, SELECT ON audit.data_audit_events TO medtravel_app;

-- Índices para consultas de auditoría
CREATE INDEX idx_audit_table      ON audit.data_audit_events(table_name, performed_at DESC);
CREATE INDEX idx_audit_row        ON audit.data_audit_events(row_id, performed_at DESC);
CREATE INDEX idx_audit_user       ON audit.data_audit_events(performed_by, performed_at DESC);
CREATE INDEX idx_audit_tenant     ON audit.data_audit_events(tenant_id, performed_at DESC);
CREATE INDEX idx_audit_operation  ON audit.data_audit_events(operation, table_name, performed_at DESC);

-- ── Archive records ───────────────────────────────────────────
CREATE TABLE audit.data_archive_records (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_schema          VARCHAR(50)  NOT NULL,
  table_name            VARCHAR(100) NOT NULL,
  row_id                UUID         NOT NULL,
  -- Solo metadatos — no copia completa del registro clínico
  -- El dato completo permanece en la tabla original con deleted_at NOT NULL
  archived_data_summary JSONB        NOT NULL,
  -- Ej: {"entity_type":"clinical.conditions","icd10":"E11","date":"2026-07-14"}
  archive_reason        VARCHAR(50)  NOT NULL
                        CHECK (archive_reason IN (
                          'RETENTION_POLICY',
                          'MEMBER_REQUEST',
                          'TENANT_OFFBOARDING',
                          'LEGAL_HOLD',
                          'MANUAL'
                        )),
  retention_policy_id   UUID,        -- FK agregada en 002_params.sql
  archive_until         DATE,
  archived_by           UUID,
  archived_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_archive_row    ON audit.data_archive_records(row_id);
CREATE INDEX idx_archive_table  ON audit.data_archive_records(table_name, archived_at DESC);
CREATE INDEX idx_archive_until  ON audit.data_archive_records(archive_until)
  WHERE archive_until IS NOT NULL;

-- ── Anonymization jobs ────────────────────────────────────────
CREATE TABLE audit.data_anonymization_jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_schema          VARCHAR(50)  NOT NULL,
  table_name            VARCHAR(100) NOT NULL,
  row_id                UUID         NOT NULL,
  retention_policy_id   UUID,
  fields_anonymized     JSONB        NOT NULL,
  -- [{"field":"first_name","method":"PSEUDONYM"},
  --  {"field":"email","method":"HASH_IRREVERSIBLE"},
  --  {"field":"doc_number","method":"REDACT"}]
  method                VARCHAR(20)  NOT NULL
                        CHECK (method IN (
                          'PSEUDONYMIZATION',
                          'HASH_IRREVERSIBLE',
                          'REDACT',
                          'GENERALIZATION',
                          'SUPPRESSION'
                        )),
  status                VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
  trigger_reason        VARCHAR(50)  NOT NULL,
  scheduled_at          TIMESTAMPTZ  NOT NULL,
  completed_at          TIMESTAMPTZ,
  error_message         TEXT,
  executed_by           UUID,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_anon_jobs_pending ON audit.data_anonymization_jobs(scheduled_at)
  WHERE status IN ('PENDING','PROCESSING');

-- ── Suppression requests ──────────────────────────────────────
CREATE TABLE audit.data_suppression_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_type        VARCHAR(20)  NOT NULL
                        CHECK (requester_type IN (
                          'MEMBER','LEGAL','TENANT_ADMIN','REGULATOR'
                        )),
  requester_id          UUID,
  requester_name        TEXT,
  member_id             UUID,
  tenant_id             UUID,
  scope                 VARCHAR(25)  NOT NULL
                        CHECK (scope IN (
                          'FULL_ERASURE',
                          'SELECTIVE_ERASURE',
                          'ANONYMIZATION',
                          'PORTABILITY'
                        )),
  regulation            VARCHAR(20)  NOT NULL,
  legal_basis           TEXT,
  specific_fields       TEXT[],
  status                VARCHAR(25)  NOT NULL DEFAULT 'RECEIVED'
                        CHECK (status IN (
                          'RECEIVED','VALIDATING','LEGAL_HOLD_CHECK',
                          'IN_PROGRESS','COMPLETED','PARTIALLY_COMPLETED',
                          'REJECTED','WITHDRAWN'
                        )),
  received_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deadline_at           TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  rejection_reason      TEXT,
  actions_taken         JSONB        NOT NULL DEFAULT '[]',
  retained_data         JSONB        NOT NULL DEFAULT '[]',
  retention_justification TEXT,
  confirmation_sent_at  TIMESTAMPTZ,
  processed_by          UUID,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suppression_member   ON audit.data_suppression_requests(member_id, status);
CREATE INDEX idx_suppression_deadline ON audit.data_suppression_requests(deadline_at)
  WHERE status NOT IN ('COMPLETED','REJECTED','WITHDRAWN');

CREATE TRIGGER trg_suppression_updated_at
  BEFORE UPDATE ON audit.data_suppression_requests
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- ── Access notifications ──────────────────────────────────────
CREATE TABLE audit.access_notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         UUID         NOT NULL,
  notification_type UUID         NOT NULL,
  title_es          TEXT         NOT NULL,
  title_en          TEXT,
  body_es           TEXT         NOT NULL,
  body_en           TEXT,
  metadata          JSONB        NOT NULL DEFAULT '{}',
  send_push         BOOLEAN      NOT NULL DEFAULT TRUE,
  send_email        BOOLEAN      NOT NULL DEFAULT FALSE,
  send_sms          BOOLEAN      NOT NULL DEFAULT FALSE,
  pushed_at         TIMESTAMPTZ,
  emailed_at        TIMESTAMPTZ,
  smsed_at          TIMESTAMPTZ,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_access_notif_member ON audit.access_notifications(member_id, created_at DESC);
CREATE INDEX idx_access_notif_unread ON audit.access_notifications(member_id)
  WHERE read_at IS NULL;

-- ══════════════════════════════════════════════════════════════
-- B4/B5: ROLES Y FORCE RLS — audit
-- ══════════════════════════════════════════════════════════════
ALTER TABLE audit.data_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.data_audit_events FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_insert ON audit.data_audit_events
  FOR INSERT TO audit_writer, app_runtime WITH CHECK (TRUE);
CREATE POLICY audit_select ON audit.data_audit_events
  FOR SELECT TO app_runtime, readonly_support
  USING (
    -- C7: tenant NULL deniega acceso — nunca amplía a toda la tabla
    app.current_uuid('app.current_tenant_id') IS NOT NULL
    AND tenant_id = app.current_uuid('app.current_tenant_id')
  );
-- Triggers deny creados en 000_extensions.sql — no duplicar aquí
GRANT INSERT         ON audit.data_audit_events TO audit_writer, app_runtime;
GRANT SELECT         ON audit.data_audit_events TO app_runtime, readonly_support;
REVOKE UPDATE, DELETE ON audit.data_audit_events FROM PUBLIC;

ALTER TABLE audit.break_glass_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.break_glass_grants FORCE ROW LEVEL SECURITY;
-- C3: app_runtime NO puede insertar directamente en break_glass_grants
-- Debe usar audit.request_break_glass() SECURITY DEFINER
-- Sin política INSERT para app_runtime = INSERT denegado por defecto
CREATE POLICY bg_select ON audit.break_glass_grants
  FOR SELECT TO app_runtime
  USING (granted_to = app.current_uuid('app.current_user_id')
         OR granted_by = app.current_uuid('app.current_user_id'));
-- C3: solo SELECT; INSERT via función controlada
GRANT SELECT ON audit.break_glass_grants TO app_runtime;

-- C3: Revocar INSERT directo en break_glass_grants para app_runtime
REVOKE INSERT ON audit.break_glass_grants FROM app_runtime;
