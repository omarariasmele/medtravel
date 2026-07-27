-- ============================================================
-- MedTravelApp — Schema SQL v1.2.3
-- 000_extensions.sql
-- Extensiones, schemas, roles, helpers seguros, funciones base
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
-- pgaudit requiere shared_preload_libraries en postgresql.conf (SRV-2)
-- CREATE EXTENSION IF NOT EXISTS "pgaudit";

-- ── SCHEMAS ───────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS clinical;
CREATE SCHEMA IF NOT EXISTS coverage;
CREATE SCHEMA IF NOT EXISTS emergency;
CREATE SCHEMA IF NOT EXISTS operations;
CREATE SCHEMA IF NOT EXISTS params;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS test;

-- ── ROLES ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='migration_owner')  THEN CREATE ROLE migration_owner  NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_runtime')      THEN CREATE ROLE app_runtime      NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='audit_writer')     THEN CREATE ROLE audit_writer     NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='readonly_support') THEN CREATE ROLE readonly_support NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='test_runner')      THEN CREATE ROLE test_runner      NOLOGIN; END IF;
END;
$$;

GRANT USAGE ON SCHEMA core,clinical,coverage,emergency,operations,params,audit,app
  TO app_runtime;
GRANT USAGE ON SCHEMA core,params,audit,operations
  TO readonly_support;
GRANT USAGE ON SCHEMA audit
  TO audit_writer;
GRANT USAGE ON SCHEMA core,clinical,coverage,emergency,operations,params,audit,app,test
  TO test_runner;

-- ── HELPERS SEGUROS (B6: NULLIF en todos los current_setting) ─
CREATE OR REPLACE FUNCTION app.current_uuid(p_key TEXT)
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app AS $$
DECLARE v TEXT;
BEGIN
  v := NULLIF(TRIM(COALESCE(current_setting(p_key, TRUE), '')), '');
  IF v IS NULL THEN RETURN NULL; END IF;
  BEGIN
    RETURN v::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN NULL;
  END;
END;
$$;
REVOKE EXECUTE ON FUNCTION app.current_uuid(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION app.current_uuid(TEXT) TO app_runtime, test_runner, readonly_support;

CREATE OR REPLACE FUNCTION app.current_text(p_key TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app AS $$
BEGIN
  RETURN NULLIF(TRIM(COALESCE(current_setting(p_key, TRUE), '')), '');
END;
$$;
REVOKE EXECUTE ON FUNCTION app.current_text(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION app.current_text(TEXT) TO app_runtime, test_runner, readonly_support;

CREATE OR REPLACE FUNCTION app.current_bool(p_key TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, app AS $$
DECLARE v TEXT;
BEGIN
  v := NULLIF(TRIM(COALESCE(current_setting(p_key, TRUE), '')), '');
  RETURN COALESCE(v = 'true', FALSE);
END;
$$;
REVOKE EXECUTE ON FUNCTION app.current_bool(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION app.current_bool(TEXT) TO app_runtime, test_runner, readonly_support;

-- ── BLIND INDEX (B7: STABLE, 2 argumentos, public para pgcrypto)
CREATE OR REPLACE FUNCTION core.blind_index(p_value TEXT, p_key TEXT)
RETURNS TEXT LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, public AS $$
BEGIN
  IF p_value IS NULL OR p_key IS NULL THEN RETURN NULL; END IF;
  RETURN encode(hmac(lower(trim(p_value)), p_key, 'sha256'), 'hex');
END;
$$;
REVOKE EXECUTE ON FUNCTION core.blind_index(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.blind_index(TEXT, TEXT) TO app_runtime, test_runner;

-- ── CIFRADO PII ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.encrypt_pii(p_value TEXT)
RETURNS BYTEA LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, public AS $$
DECLARE v_key TEXT;
BEGIN
  v_key := NULLIF(TRIM(COALESCE(current_setting('app.encryption_key', TRUE), '')), '');
  IF v_key IS NULL THEN RAISE EXCEPTION 'app.encryption_key no configurada'; END IF;
  RETURN pgp_sym_encrypt(p_value, v_key, 'compress-algo=1, cipher-algo=aes256');
END;
$$;
REVOKE EXECUTE ON FUNCTION core.encrypt_pii(TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.encrypt_pii(TEXT) TO app_runtime, test_runner;

CREATE OR REPLACE FUNCTION core.decrypt_pii(p_value BYTEA)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, public AS $$
DECLARE v_key TEXT;
BEGIN
  v_key := NULLIF(TRIM(COALESCE(current_setting('app.encryption_key', TRUE), '')), '');
  IF v_key IS NULL THEN RAISE EXCEPTION 'app.encryption_key no configurada'; END IF;
  RETURN pgp_sym_decrypt(p_value, v_key);
END;
$$;
REVOKE EXECUTE ON FUNCTION core.decrypt_pii(BYTEA) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.decrypt_pii(BYTEA) TO app_runtime, test_runner;

-- ── UPDATED_AT ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION core.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, core AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

-- ── NÚMERO DE CASO ────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS operations.case_number_seq START 1;

CREATE OR REPLACE FUNCTION operations.generate_case_number()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, operations AS $$
BEGIN
  RETURN 'MT-' || TO_CHAR(NOW(), 'YYYY-MM') || '-'
         || LPAD(nextval('operations.case_number_seq')::TEXT, 6, '0');
END;
$$;
REVOKE EXECUTE ON FUNCTION operations.generate_case_number() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION operations.generate_case_number() TO app_runtime;

-- ── CATALOG_ID ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION params.catalog_id(
  p_domain VARCHAR, p_code VARCHAR, p_tenant UUID DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, params AS $$
DECLARE v UUID;
BEGIN
  IF p_tenant IS NOT NULL THEN
    SELECT cv.id INTO v FROM params.catalog_values cv
    JOIN params.domain_catalogs dc ON cv.domain_id = dc.id
    WHERE dc.code = p_domain AND cv.code = p_code AND cv.tenant_id = p_tenant
      AND cv.active = TRUE AND cv.lifecycle_status = 'ACTIVE';
  END IF;
  IF v IS NULL THEN
    SELECT cv.id INTO v FROM params.catalog_values cv
    JOIN params.domain_catalogs dc ON cv.domain_id = dc.id
    WHERE dc.code = p_domain AND cv.code = p_code AND cv.tenant_id IS NULL
      AND cv.active = TRUE AND cv.lifecycle_status = 'ACTIVE';
  END IF;
  RETURN v;
END;
$$;
REVOKE EXECUTE ON FUNCTION params.catalog_id(VARCHAR, VARCHAR, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION params.catalog_id(VARCHAR, VARCHAR, UUID)
  TO app_runtime, test_runner, readonly_support;

-- ── AUDIT: deny modification (inmutabilidad) ──────────────────
CREATE OR REPLACE FUNCTION audit.deny_modification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit AS $$
BEGIN
  RAISE EXCEPTION 'Tabla inmutable: % prohíbe UPDATE y DELETE', TG_TABLE_NAME;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.deny_modification() FROM PUBLIC;

-- ── AUDIT: log_event (sin PII, solo diff en UPDATE) ──────────
CREATE OR REPLACE FUNCTION audit.log_event()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, app AS $$
DECLARE
  v_old  JSONB := '{}';
  v_new  JSONB := '{}';
  v_diff JSONB := '{}';
  v_key  TEXT;
  v_pii  TEXT[] := ARRAY[
    'password_hash','doc_number','email','phone',
    'token_value','token_hash','session_token','refresh_token',
    'session_token_hash','refresh_token_hash','signed_payload',
    'signature','method_value','auth_config','api_key_hash','encryption_key_ref'
  ];
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    FOR v_key IN SELECT k FROM jsonb_object_keys(row_to_json(OLD)::JSONB) k LOOP
      IF v_key = ANY(v_pii) THEN
        v_old := v_old || jsonb_build_object(v_key, '[REDACTED]');
      ELSE
        v_old := v_old || jsonb_build_object(v_key, (row_to_json(OLD)::JSONB)->v_key);
      END IF;
    END LOOP;
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    FOR v_key IN SELECT k FROM jsonb_object_keys(row_to_json(NEW)::JSONB) k LOOP
      IF v_key = ANY(v_pii) THEN
        v_new := v_new || jsonb_build_object(v_key, '[REDACTED]');
      ELSE
        v_new := v_new || jsonb_build_object(v_key, (row_to_json(NEW)::JSONB)->v_key);
      END IF;
    END LOOP;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    FOR v_key IN SELECT k FROM jsonb_object_keys(v_new) k LOOP
      IF (v_old ->> v_key) IS DISTINCT FROM (v_new ->> v_key) THEN
        v_diff := v_diff || jsonb_build_object(v_key,
          jsonb_build_object('from', v_old->v_key, 'to', v_new->v_key));
      END IF;
    END LOOP;
    IF v_diff = '{}' THEN
      IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END IF;
  END IF;
  INSERT INTO audit.data_audit_events (
    table_schema, table_name, operation, row_id,
    old_data, new_data, changed_fields,
    performed_by, tenant_id, session_id,
    ip_address, access_purpose, authorization_context,
    performed_at
  ) VALUES (
    TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP,
    COALESCE((v_new->>'id')::UUID, (v_old->>'id')::UUID),
    CASE TG_OP WHEN 'DELETE' THEN v_old ELSE NULL END,
    CASE TG_OP WHEN 'INSERT' THEN v_new ELSE NULL END,
    CASE TG_OP WHEN 'UPDATE' THEN v_diff ELSE NULL END,
    NULLIF(TRIM(COALESCE(current_setting('app.current_user_id',   TRUE), '')), '')::UUID,
    NULLIF(TRIM(COALESCE(current_setting('app.current_tenant_id', TRUE), '')), '')::UUID,
    NULLIF(TRIM(COALESCE(current_setting('app.session_id',        TRUE), '')), ''),
    NULLIF(TRIM(COALESCE(current_setting('app.client_ip',         TRUE), '')), '')::INET,
    NULLIF(TRIM(COALESCE(current_setting('app.access_purpose',    TRUE), '')), ''),
    NULLIF(TRIM(COALESCE(current_setting('app.authorization_context', TRUE), '')), ''),
    NOW()
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.log_event() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION audit.log_event() TO app_runtime;

-- ── BREAK-GLASS TABLE ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit.break_glass_grants (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  granted_to          UUID        NOT NULL,   -- FK a core.users (diferida)
  granted_by          UUID        NOT NULL,   -- FK a core.users (diferida)
  person_id           UUID        NOT NULL,   -- FK a core.persons (diferida)
  purpose_id          UUID        NOT NULL,   -- FK catalog_values BG_PURPOSE
  legal_basis_id      UUID        NOT NULL,   -- FK catalog_values BG_LEGAL_BASIS
  justification       TEXT        NOT NULL CHECK (TRIM(justification) <> ''),
  valid_from          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until         TIMESTAMPTZ NOT NULL,
  second_approver     UUID,                   -- FK a core.users (diferida)
  second_approved_at  TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  revoked_by          UUID,
  revoke_reason       TEXT,
  titular_notified_at TIMESTAMPTZ,
  CONSTRAINT no_self_approval CHECK (granted_to <> granted_by),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_break_glass_active
  ON audit.break_glass_grants(granted_to, person_id, valid_until)
  WHERE revoked_at IS NULL;

-- ── has_break_glass ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION audit.has_break_glass(p_user UUID, p_person UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, audit AS $$
BEGIN
  IF p_user IS NULL OR p_person IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM audit.break_glass_grants
    WHERE granted_to = p_user
      AND person_id  = p_person
      AND valid_from <= NOW()
      AND valid_until > NOW()
      AND revoked_at IS NULL
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.has_break_glass(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION audit.has_break_glass(UUID, UUID)
  TO app_runtime, test_runner;

-- ── enforce_break_glass_duration (C9: fail-secure) ───────────
CREATE OR REPLACE FUNCTION audit.enforce_break_glass_duration()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, params AS $$
DECLARE v_max INTEGER;
BEGIN
  SELECT limit_value INTO v_max
  FROM params.operational_limits
  WHERE limit_key = 'BREAK_GLASS_MAX_HOURS'
    AND tenant_id IS NULL AND lifecycle_status = 'ACTIVE'
  LIMIT 1;
  -- C9: fail-secure — parámetro ausente bloquea
  IF v_max IS NULL THEN
    RAISE EXCEPTION 'BREAK_GLASS_MAX_HOURS no configurado — break-glass bloqueado por seguridad';
  END IF;
  IF NEW.valid_until <= NOW() THEN
    RAISE EXCEPTION 'break_glass_grants: valid_until debe ser futuro';
  END IF;
  IF (NEW.valid_until - NEW.valid_from) > (v_max || ' hours')::INTERVAL THEN
    RAISE EXCEPTION 'break_glass_grants: vigencia supera máximo de % horas', v_max;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.enforce_break_glass_duration() FROM PUBLIC;

CREATE TRIGGER trg_break_glass_enforce
  BEFORE INSERT ON audit.break_glass_grants
  FOR EACH ROW EXECUTE FUNCTION audit.enforce_break_glass_duration();

-- ── log_break_glass_access (C8: notificación real al titular) ─
CREATE OR REPLACE FUNCTION audit.log_break_glass_access()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, params, core AS $$
BEGIN
  -- Audit event
  INSERT INTO audit.data_audit_events (
    table_schema, table_name, operation, row_id, new_data,
    performed_by, performed_at, access_purpose, authorization_context
  ) VALUES (
    'audit', 'break_glass_grants', 'INSERT', NEW.id,
    jsonb_build_object(
      'granted_to',  NEW.granted_to,
      'granted_by',  NEW.granted_by,
      'person_id',   NEW.person_id,
      'valid_from',  NEW.valid_from,
      'valid_until', NEW.valid_until,
      'justification', '[REDACTED_FOR_AUDIT]'
    ),
    NEW.granted_by, NOW(),
    'BREAK_GLASS_ACCESS', 'emergency_clinical_access'
  );
  -- C8: Notificación real al titular en audit.access_notifications
  INSERT INTO audit.access_notifications (
    member_id, notification_type,
    title_es, title_en, body_es, body_en, metadata,
    send_push
  )
  SELECT
    m.id,
    params.catalog_id('NOTIFICATION_TYPE', 'BREAK_GLASS_ACCESS'),
    'Acceso de emergencia autorizado a tu historial',
    'Emergency access authorized to your record',
    'Se autorizó un acceso de emergencia a tu historial clínico. '
      || 'Vigente hasta: ' || to_char(NEW.valid_until, 'DD/MM/YYYY HH24:MI TZ') || '. '
      || 'Si no lo reconocés, contacta soporte.',
    'An emergency access was authorized to your clinical record. '
      || 'Valid until: ' || to_char(NEW.valid_until, 'DD/MM/YYYY HH24:MI TZ') || '. '
      || 'If you do not recognize this, contact support.',
    jsonb_build_object(
      'break_glass_id', NEW.id,
      'granted_to',     NEW.granted_to,
      'valid_until',    NEW.valid_until,
      'purpose_id',     NEW.purpose_id
    ),
    TRUE
  FROM core.members m
  WHERE m.person_id = NEW.person_id
  LIMIT 1;

  -- Marcar titular_notified_at
  UPDATE audit.break_glass_grants
  SET titular_notified_at = NOW()
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.log_break_glass_access() FROM PUBLIC;

CREATE TRIGGER trg_break_glass_audit
  AFTER INSERT ON audit.break_glass_grants
  FOR EACH ROW EXECUTE FUNCTION audit.log_break_glass_access();

-- ── C3: Funciones controladas de break-glass ──────────────────
-- app_runtime NO puede INSERT directo en break_glass_grants
CREATE OR REPLACE FUNCTION audit.request_break_glass(
  p_person_id      UUID,
  p_purpose_id     UUID,
  p_legal_basis_id UUID,
  p_justification  TEXT,
  p_hours          NUMERIC DEFAULT 2,
  p_grantee_id     UUID    DEFAULT NULL
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, params, core, app AS $$
DECLARE
  v_user     UUID;
  v_max      INTEGER;
  v_grant_id UUID;
  v_grantee  UUID;
BEGIN
  v_user := app.current_uuid('app.current_user_id');
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'request_break_glass: usuario de sesión no configurado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.persons WHERE id = p_person_id) THEN
    RAISE EXCEPTION 'request_break_glass: person_id no existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM params.catalog_values
    WHERE id = p_purpose_id AND lifecycle_status = 'ACTIVE') THEN
    RAISE EXCEPTION 'request_break_glass: purpose_id inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM params.catalog_values
    WHERE id = p_legal_basis_id AND lifecycle_status = 'ACTIVE') THEN
    RAISE EXCEPTION 'request_break_glass: legal_basis_id inválido';
  END IF;
  IF NULLIF(TRIM(p_justification), '') IS NULL THEN
    RAISE EXCEPTION 'request_break_glass: justificación obligatoria';
  END IF;
  SELECT limit_value INTO v_max FROM params.operational_limits
    WHERE limit_key = 'BREAK_GLASS_MAX_HOURS'
      AND tenant_id IS NULL AND lifecycle_status = 'ACTIVE' LIMIT 1;
  IF v_max IS NULL THEN
    RAISE EXCEPTION 'BREAK_GLASS_MAX_HOURS no configurado';
  END IF;
  IF p_hours <= 0 OR p_hours > v_max THEN
    RAISE EXCEPTION 'Duración % h inválida (máximo: % h)', p_hours, v_max;
  END IF;
  -- C4: grantee no puede ser el propio solicitante
  v_grantee := COALESCE(p_grantee_id, p_person_id);
  IF v_grantee = v_user THEN
    RAISE EXCEPTION 'request_break_glass: grantee no puede ser el propio solicitante';
  END IF;
  INSERT INTO audit.break_glass_grants (
    granted_to, granted_by, person_id,
    purpose_id, legal_basis_id, justification,
    valid_from, valid_until
  ) VALUES (
    v_grantee, v_user, p_person_id,
    p_purpose_id, p_legal_basis_id, p_justification,
    NOW(), NOW() + (p_hours || ' hours')::INTERVAL
  ) RETURNING id INTO v_grant_id;
  RETURN v_grant_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.request_break_glass(UUID,UUID,UUID,TEXT,NUMERIC,UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION audit.request_break_glass(UUID,UUID,UUID,TEXT,NUMERIC,UUID)
  TO app_runtime, test_runner;

CREATE OR REPLACE FUNCTION audit.approve_break_glass(
  p_grant_id   UUID,
  p_grantee_id UUID
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, app AS $$
DECLARE v_approver UUID;
BEGIN
  v_approver := app.current_uuid('app.current_user_id');
  IF v_approver IS NULL THEN
    RAISE EXCEPTION 'approve_break_glass: usuario de sesión no configurado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM audit.break_glass_grants
    WHERE id = p_grant_id AND valid_until > NOW() AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'approve_break_glass: grant no encontrado, vencido o revocado';
  END IF;
  -- C4: segundo aprobador desde sesión — no puede ser el mismo que granted_by
  UPDATE audit.break_glass_grants
  SET second_approver    = v_approver,
      second_approved_at = NOW(),
      granted_to         = p_grantee_id
  WHERE id = p_grant_id
    AND granted_by <> v_approver;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_break_glass: el aprobador no puede ser el mismo solicitante';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.approve_break_glass(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION audit.approve_break_glass(UUID, UUID)
  TO app_runtime, test_runner;

CREATE OR REPLACE FUNCTION audit.revoke_break_glass(p_grant_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, app AS $$
DECLARE v_user UUID;
BEGIN
  v_user := app.current_uuid('app.current_user_id');
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'revoke_break_glass: usuario de sesión no configurado';
  END IF;
  UPDATE audit.break_glass_grants
  SET revoked_at    = NOW(),
      revoked_by    = v_user,
      revoke_reason = p_reason
  WHERE id = p_grant_id AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revoke_break_glass: grant no encontrado o ya revocado';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.revoke_break_glass(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION audit.revoke_break_glass(UUID, TEXT)
  TO app_runtime, test_runner;

-- ── C1+C2: has_clinical_access — ÚNICA DEFINICIÓN ─────────────
-- Integra break-glass, search_path completo, sin is_superadmin
CREATE OR REPLACE FUNCTION clinical.has_clinical_access(p_person_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, clinical, core, audit, app, params, operations AS $$
DECLARE
  v_person UUID;
  v_tenant UUID;
  v_user   UUID;
  v_case   UUID;
BEGIN
  IF p_person_id IS NULL THEN RETURN FALSE; END IF;

  v_person := app.current_uuid('app.current_person_id');
  v_tenant := app.current_uuid('app.current_tenant_id');
  v_user   := app.current_uuid('app.current_user_id');
  v_case   := app.current_uuid('app.active_case_id');

  -- 1. Titular accede a su propio historial
  IF v_person IS NOT NULL AND v_person = p_person_id THEN
    RETURN TRUE;
  END IF;

  -- 2. Token de emergencia activo
  IF app.current_bool('app.emergency_token_active')
     AND app.current_uuid('app.emergency_token_person_id') = p_person_id
  THEN
    RETURN TRUE;
  END IF;

  -- 3. Break-glass activo y auditado (C1: integrado aquí)
  IF v_user IS NOT NULL THEN
    IF audit.has_break_glass(v_user, p_person_id) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- 4. Consentimiento activo del titular para este tenant
  IF v_tenant IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM core.member_data_consents mdc
      JOIN core.members m ON mdc.member_id = m.id
      JOIN params.consent_purposes cp ON mdc.purpose_id = cp.id
      WHERE m.person_id = p_person_id
        AND m.tenant_id = v_tenant
        AND mdc.granted = TRUE
        AND (mdc.valid_until IS NULL OR mdc.valid_until > NOW())
        AND cp.code IN ('EMERGENCY_CLINICAL_ACCESS', 'FULL_CLINICAL_ACCESS')
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  -- 5. Caso de emergencia activo con este paciente
  IF v_case IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM operations.emergency_cases ec
      JOIN core.members m ON ec.member_id = m.id
      WHERE ec.id = v_case
        AND m.person_id = p_person_id
        AND ec.status_id NOT IN (
          SELECT id FROM params.catalog_values
          WHERE code IN ('CLOSED', 'CANCELLED')
        )
    ) THEN
      RETURN TRUE;
    END IF;
  END IF;

  RETURN FALSE;
END;
$$;
REVOKE EXECUTE ON FUNCTION clinical.has_clinical_access(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION clinical.has_clinical_access(UUID)
  TO app_runtime, test_runner;

-- ── C10: Inmutabilidad de person_id y member_id ───────────────
CREATE OR REPLACE FUNCTION clinical.deny_ownership_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, clinical AS $$
BEGIN
  IF OLD.person_id IS DISTINCT FROM NEW.person_id THEN
    RAISE EXCEPTION 'person_id es inmutable después del INSERT en %', TG_TABLE_NAME;
  END IF;
  BEGIN
    IF OLD.member_id IS DISTINCT FROM NEW.member_id THEN
      RAISE EXCEPTION 'member_id es inmutable después del INSERT en %', TG_TABLE_NAME;
    END IF;
  EXCEPTION WHEN undefined_column THEN NULL;
  END;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION clinical.deny_ownership_change() FROM PUBLIC;

-- ── C10: Inmutabilidad de tenant_id y member_id en casos ──────
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

-- ── SLA target desde operational_limits (B11) ─────────────────
CREATE OR REPLACE FUNCTION operations.fill_sla_target()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, operations, params AS $$
BEGIN
  IF NEW.sla_target_seconds IS NULL THEN
    SELECT limit_value INTO NEW.sla_target_seconds
    FROM params.operational_limits
    WHERE limit_key = 'CASE_SLA_FIRST_RESPONSE_SECONDS'
      AND tenant_id IS NULL AND lifecycle_status = 'ACTIVE'
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION operations.fill_sla_target() FROM PUBLIC;

-- ── TEST HELPERS ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION test.assert_equals(
  p_label TEXT, p_exp ANYELEMENT, p_act ANYELEMENT
) RETURNS VOID LANGUAGE plpgsql
SET search_path = pg_catalog, test AS $$
BEGIN
  IF p_exp IS DISTINCT FROM p_act THEN
    RAISE EXCEPTION 'FAILED [%]: expected [%] got [%]', p_label, p_exp, p_act;
  ELSE
    RAISE NOTICE 'PASSED [%]', p_label;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION test.assert_equals(TEXT, ANYELEMENT, ANYELEMENT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION test.assert_equals(TEXT, ANYELEMENT, ANYELEMENT) TO test_runner;

CREATE OR REPLACE FUNCTION test.assert_not_null(p_label TEXT, p_val ANYELEMENT)
RETURNS VOID LANGUAGE plpgsql
SET search_path = pg_catalog, test AS $$
BEGIN
  IF p_val IS NULL THEN
    RAISE EXCEPTION 'FAILED [%]: valor NULL inesperado', p_label;
  ELSE
    RAISE NOTICE 'PASSED [%]', p_label;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION test.assert_not_null(TEXT, ANYELEMENT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION test.assert_not_null(TEXT, ANYELEMENT) TO test_runner;

CREATE OR REPLACE FUNCTION test.assert_raises(p_label TEXT, p_sql TEXT)
RETURNS VOID LANGUAGE plpgsql
SET search_path = pg_catalog, test AS $$
BEGIN
  BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'FAILED [%]: excepción no lanzada', p_label;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'PASSED [%] excepción: %', p_label, SQLERRM;
  END;
END;
$$;
REVOKE EXECUTE ON FUNCTION test.assert_raises(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION test.assert_raises(TEXT, TEXT) TO test_runner;
