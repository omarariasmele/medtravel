-- ============================================================
-- Gap #8 (ver SCHEMA_GAPS.md): modelo de acceso para operadores/chat/
-- participantes de caso.
--
-- Decisión de producto (2026-07-23): un operador normal (aseguradora,
-- médico, etc.) SIEMPRE queda acotado a su propio tenant. El Superadmin
-- de OYSGROUP necesita ver cualquier tenant para asistir ante un
-- inconveniente, pero NUNCA como una regla RLS permisiva sin rastro —
-- tiene que quedar auditado quién accedió, cuándo y por qué. Se extiende
-- el mecanismo de break-glass ya existente (audit.break_glass_grants,
-- persona-scoped) con un mellizo tenant-scoped
-- (audit.tenant_break_glass_grants), mismo patrón: solicitud + segundo
-- aprobador distinto del solicitante + vigencia acotada (fail-secure si
-- falta el límite) + auditoría inmutable. No se toca break_glass_grants
-- ni sus funciones — es un mecanismo paralelo, no una modificación.
--
-- NOTA LEGAL: 'CONTRACTUAL_SUPPORT' es un placeholder de base legal —
-- confirmar la redacción real con el equipo legal antes de v1.2.4.
--
-- No se toca el baseline 000-009 aprobado; aplicar como patch adicional.
-- ============================================================


-- ── Catálogo: nuevo purpose/legal_basis para break-glass de tenant ──

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT d.id, 'PLATFORM_SUPPORT', 'Soporte de plataforma (OYSGROUP)', 'Platform support (OYSGROUP)', 5, TRUE, 'ACTIVE'
FROM params.domain_catalogs d
WHERE d.code = 'BG_PURPOSE'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = 'PLATFORM_SUPPORT'
  );

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT d.id, 'CONTRACTUAL_SUPPORT', 'Soporte contractual de plataforma (confirmar redacción legal)', 'Contractual platform support (confirm legal wording)', 5, TRUE, 'ACTIVE'
FROM params.domain_catalogs d
WHERE d.code = 'BG_LEGAL_BASIS'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = 'CONTRACTUAL_SUPPORT'
  );

-- Límite operativo de duración (B9: nada de TTLs hardcodeados) — 8h por
-- default, más corto que el clínico de emergencia porque es acceso
-- administrativo, no una emergencia médica.
INSERT INTO params.operational_limits (tenant_id, limit_key, limit_value, unit, description_es, requires_approval, lifecycle_status)
SELECT NULL, 'TENANT_BREAK_GLASS_MAX_HOURS', 8, 'HOURS',
  'Duración máxima de acceso break-glass del Superadmin a un tenant', TRUE, 'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM params.operational_limits
  WHERE limit_key = 'TENANT_BREAK_GLASS_MAX_HOURS' AND tenant_id IS NULL
);


-- ── Tabla: audit.tenant_break_glass_grants (mellizo de break_glass_grants) ──

CREATE TABLE IF NOT EXISTS audit.tenant_break_glass_grants (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  granted_to          UUID        NOT NULL,   -- FK a core.users (diferida) — quien recibe el acceso
  granted_by          UUID        NOT NULL,   -- FK a core.users (diferida) — quien lo solicita
  tenant_id           UUID        NOT NULL REFERENCES core.tenants(id),
  purpose_id          UUID        NOT NULL REFERENCES params.catalog_values(id),
  legal_basis_id      UUID        NOT NULL REFERENCES params.catalog_values(id),
  justification       TEXT        NOT NULL CHECK (TRIM(justification) <> ''),
  valid_from          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until         TIMESTAMPTZ NOT NULL,
  second_approver     UUID,                   -- FK a core.users (diferida)
  second_approved_at  TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  revoked_by          UUID,
  revoke_reason       TEXT,
  CONSTRAINT no_self_approval_tenant_bg CHECK (granted_to <> granted_by),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_break_glass_active
  ON audit.tenant_break_glass_grants(granted_to, tenant_id, valid_until)
  WHERE revoked_at IS NULL;

ALTER TABLE audit.tenant_break_glass_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit.tenant_break_glass_grants FORCE ROW LEVEL SECURITY;

-- Mismo patrón que bg_select: solo SELECT directo, INSERT vía función controlada
CREATE POLICY tenant_bg_select ON audit.tenant_break_glass_grants
  FOR SELECT TO app_runtime
  USING (
    granted_to = app.current_uuid('app.current_user_id')
    OR granted_by = app.current_uuid('app.current_user_id')
  );

GRANT SELECT ON audit.tenant_break_glass_grants TO app_runtime;
REVOKE INSERT, UPDATE, DELETE ON audit.tenant_break_glass_grants FROM app_runtime;


-- ── Duración fail-secure (mismo patrón que enforce_break_glass_duration) ──

CREATE OR REPLACE FUNCTION audit.enforce_tenant_break_glass_duration()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, params AS $$
DECLARE v_max INTEGER;
BEGIN
  SELECT limit_value INTO v_max
  FROM params.operational_limits
  WHERE limit_key = 'TENANT_BREAK_GLASS_MAX_HOURS'
    AND tenant_id IS NULL AND lifecycle_status = 'ACTIVE'
  LIMIT 1;
  IF v_max IS NULL THEN
    RAISE EXCEPTION 'TENANT_BREAK_GLASS_MAX_HOURS no configurado — break-glass de tenant bloqueado por seguridad';
  END IF;
  IF NEW.valid_until <= NOW() THEN
    RAISE EXCEPTION 'tenant_break_glass_grants: valid_until debe ser futuro';
  END IF;
  IF (NEW.valid_until - NEW.valid_from) > (v_max || ' hours')::INTERVAL THEN
    RAISE EXCEPTION 'tenant_break_glass_grants: vigencia supera máximo de % horas', v_max;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.enforce_tenant_break_glass_duration() FROM PUBLIC;

CREATE TRIGGER trg_tenant_break_glass_enforce
  BEFORE INSERT ON audit.tenant_break_glass_grants
  FOR EACH ROW EXECUTE FUNCTION audit.enforce_tenant_break_glass_duration();


-- ── Auditoría inmutable de cada grant (mismo patrón que log_break_glass_access) ──
-- No hay notificación a un "titular" único como en el break-glass
-- clínico (acá el afectado es un tenant completo, no una persona) — el
-- rastro queda en audit.data_audit_events, consultable por tenant_id.

CREATE OR REPLACE FUNCTION audit.log_tenant_break_glass_access()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit AS $$
BEGIN
  INSERT INTO audit.data_audit_events (
    table_schema, table_name, operation, row_id,
    new_data, performed_by, tenant_id, performed_at,
    access_purpose, authorization_context
  ) VALUES (
    'audit', 'tenant_break_glass_grants', 'INSERT', NEW.id,
    jsonb_build_object(
      'granted_to', NEW.granted_to,
      'granted_by', NEW.granted_by,
      'tenant_id', NEW.tenant_id,
      'valid_from', NEW.valid_from,
      'valid_until', NEW.valid_until,
      'justification', '[REDACTED_FOR_AUDIT]'
    ),
    NEW.granted_by, NEW.tenant_id, NOW(),
    'TENANT_BREAK_GLASS_ACCESS', 'superadmin_tenant_access'
  );
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.log_tenant_break_glass_access() FROM PUBLIC;

CREATE TRIGGER trg_tenant_break_glass_audit
  AFTER INSERT ON audit.tenant_break_glass_grants
  FOR EACH ROW EXECUTE FUNCTION audit.log_tenant_break_glass_access();


-- ── has_tenant_break_glass — chequeo puntual (mismo patrón que has_break_glass) ──

CREATE OR REPLACE FUNCTION audit.has_tenant_break_glass(p_user UUID, p_tenant UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, audit AS $$
BEGIN
  IF p_user IS NULL OR p_tenant IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM audit.tenant_break_glass_grants
    WHERE granted_to = p_user
      AND tenant_id  = p_tenant
      AND valid_from <= NOW()
      AND valid_until > NOW()
      AND revoked_at IS NULL
      -- second_approved_at IS NOT NULL: exige el segundo aprobador para
      -- que el grant cuente como activo, no solo la solicitud inicial.
      AND second_approved_at IS NOT NULL
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.has_tenant_break_glass(UUID, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION audit.has_tenant_break_glass(UUID, UUID)
  TO app_runtime, test_runner;


-- ── request/approve/revoke — mismo patrón de audit.request_break_glass ──
-- Diferencia deliberada: p_grantee_id es obligatorio (sin default a
-- "el propio solicitante" ni a ningún otro valor implícito) — el CHECK
-- no_self_approval_tenant_bg ya exige que sea distinto de quien pide el
-- acceso, así que hay que nombrarlo explícitamente.

CREATE OR REPLACE FUNCTION audit.request_tenant_break_glass(
  p_tenant_id      UUID,
  p_grantee_id     UUID,
  p_purpose_id     UUID,
  p_legal_basis_id UUID,
  p_justification  TEXT,
  p_hours          NUMERIC DEFAULT 4
)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, params, core, app AS $$
DECLARE
  v_user     UUID;
  v_max      INTEGER;
  v_grant_id UUID;
BEGIN
  v_user := app.current_uuid('app.current_user_id');
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'request_tenant_break_glass: usuario de sesión no configurado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM core.tenants WHERE id = p_tenant_id) THEN
    RAISE EXCEPTION 'request_tenant_break_glass: tenant_id no existe';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM params.catalog_values
    WHERE id = p_purpose_id AND lifecycle_status = 'ACTIVE') THEN
    RAISE EXCEPTION 'request_tenant_break_glass: purpose_id inválido';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM params.catalog_values
    WHERE id = p_legal_basis_id AND lifecycle_status = 'ACTIVE') THEN
    RAISE EXCEPTION 'request_tenant_break_glass: legal_basis_id inválido';
  END IF;
  IF NULLIF(TRIM(p_justification), '') IS NULL THEN
    RAISE EXCEPTION 'request_tenant_break_glass: justificación obligatoria';
  END IF;
  IF p_grantee_id = v_user THEN
    RAISE EXCEPTION 'request_tenant_break_glass: grantee no puede ser el propio solicitante';
  END IF;
  SELECT limit_value INTO v_max FROM params.operational_limits
    WHERE limit_key = 'TENANT_BREAK_GLASS_MAX_HOURS'
      AND tenant_id IS NULL AND lifecycle_status = 'ACTIVE' LIMIT 1;
  IF v_max IS NULL THEN
    RAISE EXCEPTION 'TENANT_BREAK_GLASS_MAX_HOURS no configurado';
  END IF;
  IF p_hours <= 0 OR p_hours > v_max THEN
    RAISE EXCEPTION 'Duración % h inválida (máximo: % h)', p_hours, v_max;
  END IF;
  INSERT INTO audit.tenant_break_glass_grants (
    granted_to, granted_by, tenant_id,
    purpose_id, legal_basis_id, justification,
    valid_from, valid_until
  ) VALUES (
    p_grantee_id, v_user, p_tenant_id,
    p_purpose_id, p_legal_basis_id, p_justification,
    NOW(), NOW() + (p_hours || ' hours')::INTERVAL
  ) RETURNING id INTO v_grant_id;
  RETURN v_grant_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.request_tenant_break_glass(UUID,UUID,UUID,UUID,TEXT,NUMERIC) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION audit.request_tenant_break_glass(UUID,UUID,UUID,UUID,TEXT,NUMERIC)
  TO app_runtime, test_runner;

CREATE OR REPLACE FUNCTION audit.approve_tenant_break_glass(p_grant_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, app AS $$
DECLARE v_approver UUID;
BEGIN
  v_approver := app.current_uuid('app.current_user_id');
  IF v_approver IS NULL THEN
    RAISE EXCEPTION 'approve_tenant_break_glass: usuario de sesión no configurado';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM audit.tenant_break_glass_grants
    WHERE id = p_grant_id AND valid_until > NOW() AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'approve_tenant_break_glass: grant no encontrado, vencido o revocado';
  END IF;
  UPDATE audit.tenant_break_glass_grants
  SET second_approver    = v_approver,
      second_approved_at = NOW()
  WHERE id = p_grant_id
    AND granted_by <> v_approver;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_tenant_break_glass: el aprobador no puede ser el mismo solicitante';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.approve_tenant_break_glass(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION audit.approve_tenant_break_glass(UUID)
  TO app_runtime, test_runner;

CREATE OR REPLACE FUNCTION audit.revoke_tenant_break_glass(p_grant_id UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, app AS $$
DECLARE v_user UUID;
BEGIN
  v_user := app.current_uuid('app.current_user_id');
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'revoke_tenant_break_glass: usuario de sesión no configurado';
  END IF;
  UPDATE audit.tenant_break_glass_grants
  SET revoked_at    = NOW(),
      revoked_by    = v_user,
      revoke_reason = p_reason
  WHERE id = p_grant_id AND revoked_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'revoke_tenant_break_glass: grant no encontrado o ya revocado';
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.revoke_tenant_break_glass(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION audit.revoke_tenant_break_glass(UUID, TEXT)
  TO app_runtime, test_runner;


-- ── core.has_tenant_access — el gate que usan las políticas RLS de abajo ──
-- TRUE si el tenant es el de la sesión actual, o si hay un
-- tenant_break_glass_grant activo y con segundo aprobador para el
-- usuario actual sobre ese tenant.

CREATE OR REPLACE FUNCTION core.has_tenant_access(p_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, audit, app AS $$
DECLARE
  v_tenant UUID;
  v_user   UUID;
BEGIN
  IF p_tenant_id IS NULL THEN RETURN FALSE; END IF;
  v_tenant := app.current_uuid('app.current_tenant_id');
  IF v_tenant IS NOT NULL AND v_tenant = p_tenant_id THEN
    RETURN TRUE;
  END IF;
  v_user := app.current_uuid('app.current_user_id');
  IF v_user IS NOT NULL AND audit.has_tenant_break_glass(v_user, p_tenant_id) THEN
    RETURN TRUE;
  END IF;
  RETURN FALSE;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.has_tenant_access(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.has_tenant_access(UUID)
  TO app_runtime, test_runner;


-- ── RLS: operators / operator_roles / operator_presence ──────
-- tenant_id es nullable en las tres (un rol/operador con tenant_id NULL
-- representaría algo a nivel plataforma) — sin política que lo cubra
-- explícitamente, esas filas quedan invisibles por defecto (C7:
-- fail-secure, nunca ampliar el alcance por un NULL).

ALTER TABLE operations.operators ENABLE ROW LEVEL SECURITY;
CREATE POLICY operators_tenant_access ON operations.operators
  USING (core.has_tenant_access(tenant_id));

ALTER TABLE operations.operator_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY operator_roles_tenant_access ON operations.operator_roles
  USING (core.has_tenant_access(tenant_id));

ALTER TABLE operations.operator_presence ENABLE ROW LEVEL SECURITY;
CREATE POLICY operator_presence_tenant_access ON operations.operator_presence
  USING (core.has_tenant_access(tenant_id));


-- ── operations.is_active_case_participant — evita auto-recursión RLS ──
-- case_participants_select necesita preguntar "¿el usuario actual es
-- participante activo de este caso?", pero esa pregunta consulta la
-- MISMA tabla que la política protege — sin esto, Postgres reevalúa la
-- política sobre cada fila candidata del subquery una y otra vez
-- (funciona, pero cuadrático/lentísimo: ~4x más lento medido en los
-- tests e2e). SECURITY DEFINER corre como el owner de la tabla, que no
-- está sujeto a RLS (no se puso FORCE ROW LEVEL SECURITY acá), así que
-- la consulta interna no vuelve a disparar la política. Mismo motivo
-- por el que has_clinical_access/has_tenant_access existen.
CREATE OR REPLACE FUNCTION operations.is_active_case_participant(p_case_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, operations, core, app AS $$
BEGIN
  IF p_case_id IS NULL THEN RETURN FALSE; END IF;
  RETURN EXISTS (
    SELECT 1 FROM operations.case_participants cp
    WHERE cp.case_id = p_case_id
      AND cp.is_active = TRUE
      AND (
        cp.member_id IN (
          SELECT id FROM core.members
          WHERE person_id = app.current_uuid('app.current_person_id')
        )
        OR cp.operator_id = app.current_uuid('app.current_user_id')
      )
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION operations.is_active_case_participant(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION operations.is_active_case_participant(UUID)
  TO app_runtime, test_runner;


-- ── RLS: case_participants ────────────────────────────────────
-- SELECT: el propio tenant (u operador/superadmin con acceso) ve todo;
-- un participante activo (member u operador) ve la lista de SU caso.
-- INSERT/UPDATE: solo con acceso al tenant del caso (gestión de
-- participantes es tarea de operador/superadmin, no del viajero).

ALTER TABLE operations.case_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_participants_select ON operations.case_participants
  FOR SELECT TO app_runtime
  USING (
    case_id IN (
      SELECT ec.id FROM operations.emergency_cases ec
      WHERE core.has_tenant_access(ec.tenant_id)
    )
    OR operations.is_active_case_participant(case_id)
  );

CREATE POLICY case_participants_insert ON operations.case_participants
  FOR INSERT TO app_runtime
  WITH CHECK (
    case_id IN (
      SELECT ec.id FROM operations.emergency_cases ec
      WHERE core.has_tenant_access(ec.tenant_id)
    )
  );

CREATE POLICY case_participants_update ON operations.case_participants
  FOR UPDATE TO app_runtime
  USING (
    case_id IN (
      SELECT ec.id FROM operations.emergency_cases ec
      WHERE core.has_tenant_access(ec.tenant_id)
    )
  )
  WITH CHECK (
    case_id IN (
      SELECT ec.id FROM operations.emergency_cases ec
      WHERE core.has_tenant_access(ec.tenant_id)
    )
  );

-- "Quitar" un participante es un UPDATE (is_active=FALSE, left_at=NOW()),
-- no un DELETE — 007_operations.sql nunca otorgó UPDATE acá, hace falta
-- para que el panel web pueda desactivar participantes.
GRANT UPDATE ON operations.case_participants TO app_runtime;


-- ── RLS: chat_channels ────────────────────────────────────────
-- Mismo criterio que case_participants: tenant/superadmin ve todo,
-- participante activo ve el canal de su propio caso.

ALTER TABLE operations.chat_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_channels_select ON operations.chat_channels
  FOR SELECT TO app_runtime
  USING (
    case_id IN (
      SELECT ec.id FROM operations.emergency_cases ec
      WHERE core.has_tenant_access(ec.tenant_id)
    )
    OR operations.is_active_case_participant(case_id)
  );

CREATE POLICY chat_channels_insert ON operations.chat_channels
  FOR INSERT TO app_runtime
  WITH CHECK (
    case_id IN (
      SELECT ec.id FROM operations.emergency_cases ec
      WHERE core.has_tenant_access(ec.tenant_id)
    )
  );

CREATE POLICY chat_channels_update ON operations.chat_channels
  FOR UPDATE TO app_runtime
  USING (
    case_id IN (
      SELECT ec.id FROM operations.emergency_cases ec
      WHERE core.has_tenant_access(ec.tenant_id)
    )
  )
  WITH CHECK (
    case_id IN (
      SELECT ec.id FROM operations.emergency_cases ec
      WHERE core.has_tenant_access(ec.tenant_id)
    )
  );


-- ── RLS: message_attachments / message_reads ──────────────────
-- Mismo criterio de membresía de canal que msg_select/msg_insert
-- (chat_messages, ya aprobado en 007_operations.sql) — se replica acá
-- porque son tablas hermanas del mismo chat, resueltas vía channel_id.

ALTER TABLE operations.message_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY message_attachments_select ON operations.message_attachments
  FOR SELECT TO app_runtime
  USING (
    channel_id IN (
      SELECT ch.id FROM operations.chat_channels ch
      JOIN operations.emergency_cases ec ON ec.id = ch.case_id
      WHERE core.has_tenant_access(ec.tenant_id)
    )
    OR channel_id IN (
      SELECT ch.id FROM operations.chat_channels ch
      WHERE operations.is_active_case_participant(ch.case_id)
    )
  );

CREATE POLICY message_attachments_insert ON operations.message_attachments
  FOR INSERT TO app_runtime
  WITH CHECK (
    channel_id IN (
      SELECT ch.id FROM operations.chat_channels ch
      JOIN operations.case_participants cp ON cp.case_id = ch.case_id
      WHERE cp.is_active = TRUE
        AND cp.can_send_files = TRUE
        AND (
          cp.member_id IN (
            SELECT id FROM core.members
            WHERE person_id = app.current_uuid('app.current_person_id')
          )
          OR cp.operator_id = app.current_uuid('app.current_user_id')
        )
    )
  );

CREATE POLICY message_attachments_update ON operations.message_attachments
  FOR UPDATE TO app_runtime
  USING (
    channel_id IN (
      SELECT ch.id FROM operations.chat_channels ch
      JOIN operations.emergency_cases ec ON ec.id = ch.case_id
      WHERE core.has_tenant_access(ec.tenant_id)
    )
  )
  WITH CHECK (
    channel_id IN (
      SELECT ch.id FROM operations.chat_channels ch
      JOIN operations.emergency_cases ec ON ec.id = ch.case_id
      WHERE core.has_tenant_access(ec.tenant_id)
    )
  );

ALTER TABLE operations.message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY message_reads_select ON operations.message_reads
  FOR SELECT TO app_runtime
  USING (
    channel_id IN (
      SELECT ch.id FROM operations.chat_channels ch
      JOIN operations.emergency_cases ec ON ec.id = ch.case_id
      WHERE core.has_tenant_access(ec.tenant_id)
    )
    OR channel_id IN (
      SELECT ch.id FROM operations.chat_channels ch
      WHERE operations.is_active_case_participant(ch.case_id)
    )
  );

CREATE POLICY message_reads_insert ON operations.message_reads
  FOR INSERT TO app_runtime
  WITH CHECK (
    channel_id IN (
      SELECT ch.id FROM operations.chat_channels ch
      WHERE operations.is_active_case_participant(ch.case_id)
    )
  );


-- ── RLS: chat_translations ─────────────────────────────────────
-- Solo tiene message_id (sin channel_id propio) — un salto más vía
-- operations.chat_messages para llegar al canal/caso/tenant.

ALTER TABLE operations.chat_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_translations_select ON operations.chat_translations
  FOR SELECT TO app_runtime
  USING (
    message_id IN (
      SELECT m.id FROM operations.chat_messages m
      JOIN operations.emergency_cases ec ON ec.id = m.case_id
      WHERE core.has_tenant_access(ec.tenant_id)
    )
    OR message_id IN (
      SELECT m.id FROM operations.chat_messages m
      WHERE operations.is_active_case_participant(m.case_id)
    )
  );

CREATE POLICY chat_translations_insert ON operations.chat_translations
  FOR INSERT TO app_runtime
  WITH CHECK (
    message_id IN (
      SELECT m.id FROM operations.chat_messages m
      WHERE operations.is_active_case_participant(m.case_id)
    )
  );


-- ── RLS: tenant_access_requests ────────────────────────────────
-- tenant_id directo — el modelo de aprobación (USER_CONFIRMED /
-- SYSTEM_ACTIVE_ON_CASE) ya está definido en el schema aprobado
-- (approved_by_type_id, ver 007_operations.sql); acá solo se resuelve la
-- visibilidad/escritura por tenant.

ALTER TABLE operations.tenant_access_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_access_requests_access ON operations.tenant_access_requests
  USING (core.has_tenant_access(tenant_id));
