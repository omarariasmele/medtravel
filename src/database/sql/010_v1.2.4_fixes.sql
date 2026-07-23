-- ============================================================
-- v1.2.4 — candidato de promoción, consolida los 9 gaps reales
-- encontrados al construir nestjs-api contra el schema v1.2.3 aprobado.
-- Ver SCHEMA_GAPS.md para el detalle de cada uno (por qué, cómo se
-- encontró). Todos ya están aplicados y probados contra el servidor de
-- desarrollo (22/22 tests e2e pasando) — este archivo es la
-- consolidación formal para que el equipo de diseño lo revise como un
-- solo paquete, no un cambio nuevo.
--
-- NO incluye el gap #8 (case-participants/chat-channels/operators/etc.
-- sin RLS): ese todavía está en diseño (ver decisión de producto sobre
-- superadmin cross-tenant vía break-glass), no es un fix mecánico como
-- el resto — se suma en un archivo aparte cuando esté implementado.
-- ============================================================


-- ── Gap #1: 002_params.sql sin GRANT a app_runtime ─────────────
-- (src/database/sql/fix-002-missing-params-grants.sql)

GRANT SELECT, INSERT, UPDATE ON
  params.domain_catalogs,
  params.catalog_values,
  params.catalog_translations,
  params.workflow_definitions,
  params.state_transitions,
  params.workflow_actions,
  params.policy_rules,
  params.rule_conditions,
  params.rule_actions,
  params.form_schemas,
  params.field_definitions,
  params.validation_rules,
  params.design_token_sets,
  params.tenant_themes,
  params.partner_api_profiles,
  params.field_mappings,
  params.integration_contracts,
  params.feature_flags,
  params.flag_overrides,
  params.operational_limits,
  params.retention_policies,
  params.consent_purposes,
  params.jurisdiction_rules
TO app_runtime;

GRANT SELECT ON
  params.domain_catalogs,
  params.catalog_values,
  params.catalog_translations
TO readonly_support;


-- ── Gap #2: core.users sin política SELECT — login imposible ──
-- (src/database/sql/proposed-core-login-credentials-function.sql)

CREATE OR REPLACE FUNCTION core.get_login_credentials(p_email_blind_index TEXT)
RETURNS TABLE (
  user_id         UUID,
  person_id       UUID,
  active          BOOLEAN,
  password_hash   TEXT,
  must_change     BOOLEAN,
  failed_attempts SMALLINT,
  locked_until    TIMESTAMPTZ
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.person_id,
    u.active,
    ac.password_hash,
    ac.must_change,
    ac.failed_attempts,
    ac.locked_until
  FROM core.users u
  JOIN core.authentication_credentials ac ON ac.user_id = u.id
  WHERE u.email_blind_index = p_email_blind_index;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.get_login_credentials(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.get_login_credentials(TEXT) TO app_runtime;


-- ── Gap #3: domains de catálogo de chat/participantes sin sembrar ──
-- IMPORTANTE: estos son los mismos valores que ya están sembrados en el
-- servidor de desarrollo (fixtures de test), NO una propuesta de diseño
-- final — los labels ("MEMBER", "TEXT", "SENT", etc.) son placeholders.
-- Antes de promover esto a v1.2.4 de verdad, el equipo de diseño tiene
-- que definir: labels es/en reales, qué otros valores hacen falta por
-- domain (ej. CHAT_SENDER_TYPE también necesita SYSTEM; CHAT_MESSAGE_TYPE
-- necesita FILE/SYSTEM_NOTICE; CHAT_MESSAGE_STATUS necesita
-- DELIVERED/READ/FAILED; CHAT_CHANNEL_STATUS necesita ARCHIVED/CLOSED;
-- CASE_PARTICIPANT_TYPE necesita OPERATOR/PROFESSIONAL). Se deja acá tal
-- cual está en desarrollo para que el fix sea reproducible, no como
-- versión final.

INSERT INTO params.domain_catalogs (code, name_es, allows_tenant_override, is_system)
SELECT code, code, FALSE, TRUE
FROM (VALUES
  ('CHAT_SENDER_TYPE'),
  ('CHAT_MESSAGE_TYPE'),
  ('CHAT_MESSAGE_STATUS'),
  ('CHAT_CHANNEL_TYPE'),
  ('CHAT_CHANNEL_STATUS'),
  ('CASE_PARTICIPANT_TYPE')
) AS d(code)
WHERE NOT EXISTS (
  SELECT 1 FROM params.domain_catalogs WHERE domain_catalogs.code = d.code
);

INSERT INTO params.catalog_values (domain_id, code, label_es, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.code, 0, FALSE, 'ACTIVE'
FROM (VALUES
  ('CHAT_SENDER_TYPE', 'MEMBER'),
  ('CHAT_SENDER_TYPE', 'OPERATOR'),
  ('CHAT_MESSAGE_TYPE', 'TEXT'),
  ('CHAT_MESSAGE_STATUS', 'SENT'),
  ('CHAT_CHANNEL_TYPE', 'CASE_MAIN'),
  ('CHAT_CHANNEL_STATUS', 'ACTIVE'),
  ('CASE_PARTICIPANT_TYPE', 'MEMBER')
) AS v(domain_code, code)
JOIN params.domain_catalogs dc ON dc.code = v.domain_code
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv
  WHERE cv.domain_id = dc.id AND cv.code = v.code
);


-- ── Gap #4: claves de operational_limits para el lockout de cuenta ──

INSERT INTO params.operational_limits (limit_key, limit_value, tenant_id, lifecycle_status)
SELECT key, value, NULL, 'ACTIVE'
FROM (VALUES
  ('AUTH_MAX_FAILED_ATTEMPTS', 5),
  ('AUTH_LOCKOUT_MINUTES', 15)
) AS l(key, value)
WHERE NOT EXISTS (
  SELECT 1 FROM params.operational_limits
  WHERE limit_key = l.key AND tenant_id IS NULL
);


-- ── Gap #5: audit.data_anonymization_jobs sin GRANT + función real ──
-- (src/database/sql/proposed-anonymization-support.sql)

GRANT SELECT, INSERT, UPDATE ON audit.data_anonymization_jobs TO app_runtime;

CREATE OR REPLACE FUNCTION audit.anonymize_field(
  p_table_schema TEXT,
  p_table_name   TEXT,
  p_field        TEXT,
  p_row_id       UUID,
  p_method       TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, public AS $$
DECLARE
  v_sql    TEXT;
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = p_table_schema
      AND table_name = p_table_name
      AND column_name = p_field
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'Columna %.%.% no existe', p_table_schema, p_table_name, p_field;
  END IF;

  IF p_method = 'HASH_IRREVERSIBLE' THEN
    v_sql := format(
      'UPDATE %I.%I SET %I = encode(digest(%I::text, ''sha256''), ''hex'') WHERE id = $1',
      p_table_schema, p_table_name, p_field, p_field
    );
  ELSIF p_method = 'PSEUDONYMIZATION' THEN
    v_sql := format(
      'UPDATE %I.%I SET %I = ''ANON-'' || substr(md5(random()::text), 1, 12) WHERE id = $1',
      p_table_schema, p_table_name, p_field
    );
  ELSE
    v_sql := format(
      'UPDATE %I.%I SET %I = NULL WHERE id = $1',
      p_table_schema, p_table_name, p_field
    );
  END IF;

  EXECUTE v_sql USING p_row_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.anonymize_field(TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.anonymize_field(TEXT, TEXT, TEXT, UUID, TEXT) TO app_runtime;


-- ── Gap #6: core.mfa_methods sin RLS + MFA_METHOD sin catalog_values ──
-- (src/database/sql/proposed-mfa-methods-hardening.sql)

ALTER TABLE core.mfa_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfa_methods_self ON core.mfa_methods
  USING (
    user_id = app.current_uuid('app.current_user_id')
  );

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, 'TOTP', 'Código de un solo uso (app autenticadora)', 'Time-based one-time code', 1, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
WHERE dc.code = 'MFA_METHOD'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv
    JOIN params.domain_catalogs dc2 ON cv.domain_id = dc2.id
    WHERE dc2.code = 'MFA_METHOD' AND cv.code = 'TOTP'
  );


-- ── Gap #7: operations.trips / trip_destinations sin RLS ──────
-- (src/database/sql/proposed-trips-rls.sql)

ALTER TABLE operations.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY trips_access ON operations.trips
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
         OR tenant_id = app.current_uuid('app.current_tenant_id')
    )
  );

ALTER TABLE operations.trip_destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_destinations_access ON operations.trip_destinations
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
         OR tenant_id = app.current_uuid('app.current_tenant_id')
    )
  );


-- ── Gap #9: 004_coverage.sql sin GRANT en 11 de sus 14 tablas ──
-- (src/database/sql/fix-004-missing-coverage-grants.sql)

GRANT SELECT, INSERT, UPDATE ON coverage.assistance_plans                TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.plan_coverages                  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.coverage_sponsors               TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.card_networks                  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.card_issuers                   TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.card_benefit_programs          TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.travel_assistance_enrollments  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.coverage_acquisition_channels  TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.member_card_benefit_links      TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.coverage_eligibility_rules     TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.health_coverages               TO app_runtime;
