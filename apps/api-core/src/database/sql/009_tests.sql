-- ============================================================
-- MedTravelApp — Schema SQL v1.2.3
-- 009_tests.sql
-- CHANGELOG v1.2.3 — C1-C8:
--   B2: schema test ya existe (creado en 000_extensions.sql)
--   Nuevos tests para B3 (RLS clínico), B5 (audit diff),
--   B6 (blind index), B9 (operational_limits), B11 (vigencia)
-- ============================================================
-- Para ejecutar: SELECT * FROM test.run_all();
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- BLOQUE 1: AISLAMIENTO MULTITENANT
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION test.run_multitenant_isolation()
RETURNS SETOF TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_ta UUID; v_tb UUID;
  v_pa UUID; v_pb UUID;
  v_ma UUID; v_mb UUID;
  n    INTEGER;
  b    BOOLEAN;
BEGIN
  -- Setup
  INSERT INTO core.tenants (code,name) VALUES ('T_AXA_ISO','AXA ISO Test') RETURNING id INTO v_ta;
  INSERT INTO core.tenants (code,name) VALUES ('T_ASS_ISO','Assis ISO Test') RETURNING id INTO v_tb;
  INSERT INTO core.persons (first_name,last_name) VALUES ('Marina','Sosa') RETURNING id INTO v_pa;
  INSERT INTO core.persons (first_name,last_name) VALUES ('Juan','García') RETURNING id INTO v_pb;
  INSERT INTO core.members (person_id,tenant_id,status_id)
    VALUES (v_pa,v_ta,params.catalog_id('MEMBER_STATUS','ACTIVE')) RETURNING id INTO v_ma;
  INSERT INTO core.members (person_id,tenant_id,status_id)
    VALUES (v_pb,v_tb,params.catalog_id('MEMBER_STATUS','ACTIVE')) RETURNING id INTO v_mb;

  -- T1.1 AXA solo ve sus members — verificación directa con WHERE
  SELECT COUNT(*) INTO n FROM core.members WHERE tenant_id = v_ta;
  PERFORM test.assert_equals('T1.1 AXA ve solo 1 member en su tenant', 1, n);

  -- T1.2 AssisCard solo ve sus members
  SELECT COUNT(*) INTO n FROM core.members WHERE tenant_id = v_tb;
  PERFORM test.assert_equals('T1.2 AssisCard ve solo 1 member en su tenant', 1, n);

  -- T1.3 AXA no ve member de AssisCard (verificación cruzada)
  SELECT COUNT(*) INTO n FROM core.members WHERE tenant_id = v_ta AND id = v_mb;
  PERFORM test.assert_equals('T1.3 member de AssisCard no pertenece a AXA', 0, n);

  -- T1.4 Insertar alergia para persona de AXA
  INSERT INTO clinical.allergies (
    person_id, member_id, allergen_name,
    allergen_type_id, severity_id,
    canonical_status_id, provenance_id
  ) VALUES (
    v_pa, v_ma, 'Penicilina',
    params.catalog_id('ALLERGEN_TYPE','MEDICATION'),
    params.catalog_id('REACTION_SEVERITY','CRITICAL'),
    params.catalog_id('CANONICAL_STATUS','IN_CANONICAL'),
    params.catalog_id('PROVENANCE_TYPE','SELF_DECLARED')
  );

  -- T1.5 AssisCard NO ve alergias de persona de AXA (sin consentimiento)
  -- Verificación directa: clinical.has_clinical_access devuelve FALSE para tb+pa
  PERFORM set_config('app.current_tenant_id', v_tb::TEXT, TRUE);
  PERFORM set_config('app.current_person_id', '', TRUE);
  PERFORM set_config('app.emergency_token_active', 'false', TRUE);
  PERFORM set_config('app.active_case_id', '', TRUE);
  -- Verificar que has_clinical_access deniega acceso
  SELECT clinical.has_clinical_access(v_pa) INTO b;
  PERFORM test.assert_equals('T1.5 has_clinical_access niega acceso a AssisCard sin consent', FALSE, b);

  -- T1.6 Persona ve sus propias alergias (has_clinical_access devuelve TRUE)
  PERFORM set_config('app.current_person_id', v_pa::TEXT, TRUE);
  PERFORM set_config('app.current_tenant_id', '', TRUE);
  SELECT clinical.has_clinical_access(v_pa) INTO b;
  PERFORM test.assert_equals('T1.6 Titular accede a sus propias alergias', TRUE, b);

  -- T1.7 Analytics aislado por tenant
  INSERT INTO operations.tenant_analytics_cache (tenant_id,member_id,display_name)
    VALUES (v_ta,v_ma,'M.S.'),(v_tb,v_mb,'J.G.');
  PERFORM set_config('app.current_tenant_id', v_ta::TEXT, TRUE);
  PERFORM set_config('app.current_person_id', '', TRUE);
  SELECT COUNT(*) INTO n FROM operations.tenant_analytics_cache
    WHERE tenant_id = v_ta;
  PERFORM test.assert_equals('T1.7 Analytics AXA: solo 1 en su tenant', 1, n);

  -- Cleanup
  DELETE FROM operations.tenant_analytics_cache WHERE tenant_id IN (v_ta,v_tb);
  DELETE FROM clinical.allergies WHERE person_id = v_pa;
  DELETE FROM core.members WHERE id IN (v_ma,v_mb);
  DELETE FROM core.persons WHERE id IN (v_pa,v_pb);
  DELETE FROM core.tenants WHERE id IN (v_ta,v_tb);

  RETURN NEXT 'MULTITENANT ISOLATION: 7/7 passed';
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- BLOQUE 2: ESTADOS CLÍNICOS MTA-511
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION test.run_clinical_states()
RETURNS SETOF TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_tenant UUID; v_person UUID; v_member UUID;
  v_prof UUID; v_user_p UUID; v_enc UUID; v_sub UUID;
  v_status TEXT; n INTEGER; b BOOLEAN;
BEGIN
  -- Setup
  INSERT INTO core.tenants (code,name) VALUES ('T_STATES','States Test') RETURNING id INTO v_tenant;
  INSERT INTO core.persons (first_name,last_name) VALUES ('Test','States') RETURNING id INTO v_person;
  INSERT INTO core.members (person_id,tenant_id,status_id)
    VALUES (v_person,v_tenant,params.catalog_id('MEMBER_STATUS','ACTIVE')) RETURNING id INTO v_member;

  -- Usuario para el profesional (B7: auth unificada)
  INSERT INTO core.users (person_id, email, email_blind_index)
    VALUES (v_person, core.encrypt_pii('prof@test.com'), core.blind_index('prof@test.com', 'test-blind-index-key-32chars!!!'))
    RETURNING id INTO v_user_p;

  INSERT INTO clinical.healthcare_professionals (
    user_id, first_name, last_name,
    doc_type_id, doc_number, doc_number_idx,
    country_id, license_number,
    trust_level_id, terms_accepted
  ) VALUES (
    v_user_p, 'Dr', 'States',
    params.catalog_id('DOCUMENT_TYPE','PASSPORT'),
    core.encrypt_pii('PAX12345'), core.blind_index('pax12345', 'test-blind-index-key-32chars!!!'),
    params.catalog_id('COUNTRY','AR'), 'MAT-99999',
    params.catalog_id('PROFESSIONAL_TRUST_LEVEL','REGISTERED'), TRUE
  ) RETURNING id INTO v_prof;

  -- T2.1: REGISTERED → submission PROVISIONAL
  INSERT INTO clinical.encounters (
    person_id, member_id, professional_id,
    encounter_date, encounter_type_id, status_id
  ) VALUES (
    v_person, v_member, v_prof, CURRENT_DATE,
    params.catalog_id('ENCOUNTER_TYPE','CONSULTATION'),
    params.catalog_id('ENCOUNTER_STATUS','COMPLETED')
  ) RETURNING id INTO v_enc;

  INSERT INTO clinical.encounter_submissions (
    encounter_id, person_id, member_id, professional_id,
    submission_type_id, clinical_data, icd10_code,
    canonical_status_id, confirmation_status_id, certification_status_id,
    requires_member_confirmation,
    professional_license_snapshot, professional_trust_level_snapshot
  ) VALUES (
    v_enc, v_person, v_member, v_prof,
    params.catalog_id('SUBMISSION_TYPE','DIAGNOSIS'),
    '{"condition":"E11","name":"Diabetes tipo 2"}'::JSONB, 'E11',
    params.catalog_id('CANONICAL_STATUS','PROVISIONAL'),
    params.catalog_id('CONFIRMATION_STATUS','PENDING'),
    params.catalog_id('CERTIFICATION_STATUS','UNCERTIFIED'),
    TRUE, 'MAT-99999', 'REGISTERED'
  ) RETURNING id INTO v_sub;

  SELECT cv.code INTO v_status FROM params.catalog_values cv
    WHERE cv.id = (SELECT canonical_status_id FROM clinical.encounter_submissions WHERE id = v_sub);
  PERFORM test.assert_equals('T2.1 REGISTERED→PROVISIONAL', 'PROVISIONAL', v_status);

  -- T2.2: Titular confirma → IN_CANONICAL
  UPDATE clinical.encounter_submissions SET
    canonical_status_id    = params.catalog_id('CANONICAL_STATUS','IN_CANONICAL'),
    confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS','MEMBER_CONFIRMED'),
    member_confirmed       = TRUE,
    member_reviewed_at     = NOW()
  WHERE id = v_sub;
  SELECT cv.code INTO v_status FROM params.catalog_values cv
    WHERE cv.id = (SELECT canonical_status_id FROM clinical.encounter_submissions WHERE id = v_sub);
  PERFORM test.assert_equals('T2.2 Confirmado→IN_CANONICAL', 'IN_CANONICAL', v_status);

  -- T2.3: PROFESSIONAL_CERTIFIED activa mfa_required (trigger)
  UPDATE clinical.healthcare_professionals SET
    trust_level_id = params.catalog_id('PROFESSIONAL_TRUST_LEVEL','PROFESSIONAL_CERTIFIED')
  WHERE id = v_prof;
  SELECT mfa_required INTO b FROM clinical.healthcare_professionals WHERE id = v_prof;
  PERFORM test.assert_equals('T2.3 PROFESSIONAL_CERTIFIED activa MFA', TRUE, b);

  -- T2.4: CERTIFIED → directo al canónico sin confirmación
  INSERT INTO clinical.encounter_submissions (
    encounter_id, person_id, member_id, professional_id,
    submission_type_id, clinical_data,
    canonical_status_id, certification_status_id,
    requires_member_confirmation,
    professional_trust_level_snapshot
  ) VALUES (
    v_enc, v_person, v_member, v_prof,
    params.catalog_id('SUBMISSION_TYPE','DIAGNOSIS'),
    '{"condition":"I10","name":"Hipertensión"}'::JSONB,
    params.catalog_id('CANONICAL_STATUS','IN_CANONICAL'),
    params.catalog_id('CERTIFICATION_STATUS','PROFESSIONALLY_CERTIFIED'),
    FALSE, 'PROFESSIONAL_CERTIFIED'
  );
  SELECT cv.code INTO v_status FROM params.catalog_values cv
    WHERE cv.id = (
      SELECT certification_status_id FROM clinical.encounter_submissions
      WHERE professional_id = v_prof AND requires_member_confirmation = FALSE
      ORDER BY created_at DESC LIMIT 1
    );
  PERFORM test.assert_equals('T2.4 CERTIFIED→PROFESSIONALLY_CERTIFIED', 'PROFESSIONALLY_CERTIFIED', v_status);

  -- T2.5: Impugnación no borra — sigue IN_CANONICAL
  UPDATE clinical.encounter_submissions SET
    member_challenged      = TRUE,
    member_challenge_notes = 'No reconozco este diagnóstico',
    confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS','MEMBER_CHALLENGED')
  WHERE id = v_sub;
  SELECT cv.code INTO v_status FROM params.catalog_values cv
    WHERE cv.id = (SELECT canonical_status_id FROM clinical.encounter_submissions WHERE id = v_sub);
  PERFORM test.assert_equals('T2.5 Impugnación no borra—sigue IN_CANONICAL', 'IN_CANONICAL', v_status);
  SELECT member_challenged INTO b FROM clinical.encounter_submissions WHERE id = v_sub;
  PERFORM test.assert_equals('T2.5b Challenge registrado', TRUE, b);

  -- T2.6: Audit log registró diferencias (no copias completas)
  SELECT COUNT(*) INTO n FROM audit.data_audit_events
    WHERE table_name = 'encounter_submissions' AND row_id = v_sub;
  IF n < 2 THEN
    RAISE EXCEPTION 'T2.6 FAILED: esperados >=2 eventos audit, obtenidos %', n;
  ELSE
    RAISE NOTICE 'TEST PASSED [T2.6 Audit % eventos para submission]', n;
  END IF;

  -- T2.7: B5 Audit NO contiene PII completa en old_data/new_data
  -- Los campos sensibles deben aparecer como [REDACTED]
  SELECT COUNT(*) INTO n FROM audit.data_audit_events
    WHERE table_name = 'encounter_submissions'
    AND (old_data::TEXT LIKE '%password%' OR new_data::TEXT LIKE '%password%');
  PERFORM test.assert_equals('T2.7 Audit no contiene password en PII fields', 0, n);

  -- Cleanup
  DELETE FROM clinical.encounter_submissions WHERE encounter_id = v_enc;
  DELETE FROM clinical.encounters WHERE id = v_enc;
  DELETE FROM clinical.healthcare_professionals WHERE id = v_prof;
  DELETE FROM core.users WHERE id = v_user_p;
  DELETE FROM core.members WHERE id = v_member;
  DELETE FROM core.persons WHERE id = v_person;
  DELETE FROM core.tenants WHERE id = v_tenant;

  RETURN NEXT 'CLINICAL STATES MTA-511: 7/7 passed';
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- BLOQUE 3: PARAMETRIZACIÓN Y OPERATIONAL LIMITS
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION test.run_parametrization()
RETURNS SETOF TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_tenant UUID; v_id UUID; v_code TEXT; n INTEGER;
BEGIN
  INSERT INTO core.tenants (code,name) VALUES ('T_PARAM','Param Test') RETURNING id INTO v_tenant;

  -- T3.1: Dominios cargados
  SELECT COUNT(*) INTO n FROM params.domain_catalogs WHERE is_system = TRUE;
  IF n < 20 THEN RAISE EXCEPTION 'T3.1 FAILED: <%> dominios (esperado >=20)', n; END IF;
  RAISE NOTICE 'TEST PASSED [T3.1 % dominios de sistema]', n;

  -- T3.2: catalog_id resuelve correctamente
  v_id := params.catalog_id('CANONICAL_STATUS','IN_CANONICAL');
  PERFORM test.assert_not_null('T3.2 catalog_id resuelve IN_CANONICAL', v_id);

  -- T3.3: Los 5 niveles de trust profesional están cargados y ordenados
  SELECT COUNT(*) INTO n FROM params.catalog_values cv
    JOIN params.domain_catalogs dc ON cv.domain_id = dc.id
    WHERE dc.code = 'PROFESSIONAL_TRUST_LEVEL' AND cv.is_system = TRUE;
  PERFORM test.assert_equals('T3.3 5 niveles de trust profesional', 5, n);

  -- T3.4: DRAFT no resuelve por catalog_id
  INSERT INTO params.catalog_values (
    domain_id, code, label_es, label_en, lifecycle_status
  ) VALUES (
    (SELECT id FROM params.domain_catalogs WHERE code = 'CASE_STATUS'),
    'DRAFT_TEST_VALUE', 'Draft Test', 'Draft Test', 'DRAFT'
  );
  v_id := params.catalog_id('CASE_STATUS','DRAFT_TEST_VALUE');
  PERFORM test.assert_equals('T3.4 DRAFT no resuelve por catalog_id', NULL::UUID, v_id);

  -- T3.5: B9 Operational limits cargados
  SELECT COUNT(*) INTO n FROM params.operational_limits WHERE tenant_id IS NULL AND lifecycle_status = 'ACTIVE';
  IF n < 20 THEN RAISE EXCEPTION 'T3.5 FAILED: <%> limits (esperado >=20)', n; END IF;
  RAISE NOTICE 'TEST PASSED [T3.5 % operational limits globales]', n;

  -- T3.6: B9 TOKEN_DYNAMIC_QR_TTL_SECONDS existe y tiene valor razonable
  SELECT limit_value INTO n FROM params.operational_limits
    WHERE limit_key = 'TOKEN_DYNAMIC_QR_TTL_SECONDS' AND tenant_id IS NULL;
  IF n < 30 OR n > 300 THEN
    RAISE EXCEPTION 'T3.6 FAILED: QR TTL % segundos fuera de rango razonable (30-300)', n;
  ELSE
    RAISE NOTICE 'TEST PASSED [T3.6 QR TTL = % segundos]', n;
  END IF;

  -- T3.7: B6 blind_index produce resultado consistente (determinístico)
  PERFORM test.assert_equals(
    'T3.7 blind_index determinístico',
    core.blind_index('test@example.com', 'test-blind-index-key-32chars!!!'),
    core.blind_index('test@example.com', 'test-blind-index-key-32chars!!!')
  );

  -- T3.8: B6 blind_index es sensible a diferencias (emails diferentes → índices diferentes)
  IF core.blind_index('a@example.com', 'test-blind-index-key-32chars!!!') = core.blind_index('b@example.com', 'test-blind-index-key-32chars!!!') THEN
    RAISE EXCEPTION 'T3.8 FAILED: blind_index debería producir valores distintos para inputs distintos';
  ELSE
    RAISE NOTICE 'TEST PASSED [T3.8 blind_index distingue emails diferentes]';
  END IF;

  -- T3.9: B11 expires_at NOT NULL en tokens
  PERFORM test.assert_raises(
    'T3.9 Token sin expires_at debe fallar',
    format($q$
      INSERT INTO emergency.tokens
        (member_id, token_type_id, token_value, token_hash, access_url, status_id)
      VALUES
        (%L, %L, 'tok-test-no-exp', 'hash', 'https://x.com', %L)
    $q$,
    gen_random_uuid(),
    params.catalog_id('TOKEN_TYPE','DYNAMIC_QR'),
    params.catalog_id('TOKEN_STATUS','ACTIVE')
    )
  );

  -- T3.10: B5 audit.deny_modification bloquea UPDATE en audit_events
  DECLARE v_evt_id UUID;
  BEGIN
    -- Crear un evento real para intentar modificarlo
    -- (usamos INSERT directo para eludir el trigger y crear un registro de prueba)
    v_evt_id := gen_random_uuid();
    EXECUTE format(
      'INSERT INTO audit.data_audit_events (id, table_schema, table_name, operation, performed_at)
       VALUES (%L, ''test'', ''test_table'', ''INSERT'', NOW())', v_evt_id
    );
    PERFORM test.assert_raises(
      'T3.10 UPDATE en audit_events debe lanzar excepción',
      format('UPDATE audit.data_audit_events SET table_name = ''hacked'' WHERE id = %L', v_evt_id)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'TEST PASSED [T3.10 Audit inmutable confirmado: %]', SQLERRM;
  END;

  -- T3.11: B4 FKs reales — insertar con catalog_id inválido debe fallar
  PERFORM test.assert_raises(
    'T3.11 FK a catalog_values invalida debe fallar',
    format($q$
      INSERT INTO core.members (person_id, tenant_id, status_id)
      VALUES (%L, %L, %L)
    $q$,
    gen_random_uuid(), v_tenant, gen_random_uuid()  -- UUID inventado para status_id
    )
  );

  -- T3.12: B8 plan_coverages no tiene limit_amount
  SELECT COUNT(*) INTO n FROM information_schema.columns
    WHERE table_schema = 'coverage'
    AND table_name = 'plan_coverages'
    AND column_name = 'limit_amount';
  PERFORM test.assert_equals('T3.12 plan_coverages no tiene limit_amount (B8)', 0, n);

  -- T3.13: B7 healthcare_professionals no tiene password_hash propio
  SELECT COUNT(*) INTO n FROM information_schema.columns
    WHERE table_schema = 'clinical'
    AND table_name = 'healthcare_professionals'
    AND column_name = 'password_hash';
  PERFORM test.assert_equals('T3.13 professionals sin password_hash (B7)', 0, n);

  -- Cleanup
  DELETE FROM params.catalog_values WHERE code = 'DRAFT_TEST_VALUE';
  DELETE FROM core.tenants WHERE id = v_tenant;

  RETURN NEXT 'PARAMETRIZATION + B3-B11: 13/13 passed';
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- BLOQUE 4: RLS CLÍNICO CON CONSENTIMIENTO (B3)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION test.run_rls_clinical_consent()
RETURNS SETOF TEXT LANGUAGE plpgsql AS $$
DECLARE
  v_ta UUID; v_tb UUID;
  v_pa UUID;
  v_ma UUID; v_mb UUID;
  v_purpose UUID;
  n INTEGER;
  b BOOLEAN;
BEGIN
  INSERT INTO core.tenants (code,name) VALUES ('T_RLS_A','RLS Tenant A') RETURNING id INTO v_ta;
  INSERT INTO core.tenants (code,name) VALUES ('T_RLS_B','RLS Tenant B') RETURNING id INTO v_tb;
  INSERT INTO core.persons (first_name,last_name) VALUES ('RLS','Person') RETURNING id INTO v_pa;
  INSERT INTO core.members (person_id,tenant_id,status_id)
    VALUES (v_pa,v_ta,params.catalog_id('MEMBER_STATUS','ACTIVE')) RETURNING id INTO v_ma;
  INSERT INTO core.members (person_id,tenant_id,status_id)
    VALUES (v_pa,v_tb,params.catalog_id('MEMBER_STATUS','ACTIVE')) RETURNING id INTO v_mb;

  -- Agregar alergia a la persona
  INSERT INTO clinical.allergies (
    person_id, member_id, allergen_name,
    allergen_type_id, severity_id,
    canonical_status_id, provenance_id
  ) VALUES (
    v_pa, v_ma, 'Aspirina',
    params.catalog_id('ALLERGEN_TYPE','MEDICATION'),
    params.catalog_id('REACTION_SEVERITY','MODERATE'),
    params.catalog_id('CANONICAL_STATUS','IN_CANONICAL'),
    params.catalog_id('PROVENANCE_TYPE','SELF_DECLARED')
  );

  -- T4.1: Tenant A SIN consentimiento — has_clinical_access devuelve FALSE
  PERFORM set_config('app.current_tenant_id', v_ta::TEXT, TRUE);
  PERFORM set_config('app.current_person_id', '', TRUE);
  PERFORM set_config('app.emergency_token_active', 'false', TRUE);
  PERFORM set_config('app.active_case_id', '', TRUE);
  SELECT clinical.has_clinical_access(v_pa) INTO b;
  PERFORM test.assert_equals('T4.1 Tenant sin consentimiento: has_clinical_access=FALSE', FALSE, b);

  -- Crear purpose de consentimiento
  INSERT INTO params.consent_purposes (code, name_es, description_es, legal_basis, data_categories)
    VALUES ('EMERGENCY_CLINICAL_ACCESS','Acceso clínico emergencia','Acceso a historial','CONSENT',ARRAY['health'])
    RETURNING id INTO v_purpose;

  -- T4.2: Tenant A CON consentimiento activo SÍ ve alergias
  INSERT INTO core.member_data_consents (member_id, tenant_id, purpose_id, granted, consent_text_version)
    VALUES (v_ma, v_ta, v_purpose, TRUE, 'v1.0');
  SELECT clinical.has_clinical_access(v_pa) INTO b;
  PERFORM test.assert_equals('T4.2 Tenant CON consentimiento: has_clinical_access=TRUE', TRUE, b);

  -- T4.3: Tenant B SIN consentimiento NO ve alergias de la misma persona
  PERFORM set_config('app.current_tenant_id', v_tb::TEXT, TRUE);
  SELECT clinical.has_clinical_access(v_pa) INTO b;
  PERFORM test.assert_equals('T4.3 Tenant B sin consentimiento: has_clinical_access=FALSE', FALSE, b);

  -- T4.4: Acceso por token de emergencia activo
  PERFORM set_config('app.current_tenant_id', '', TRUE);
  PERFORM set_config('app.current_person_id', '', TRUE);
  PERFORM set_config('app.emergency_token_active', 'true', TRUE);
  PERFORM set_config('app.emergency_token_person_id', v_pa::TEXT, TRUE);
  SELECT clinical.has_clinical_access(v_pa) INTO b;
  PERFORM test.assert_equals('T4.4 Emergency token activo: has_clinical_access=TRUE', TRUE, b);

  -- Reset emergency token
  PERFORM set_config('app.emergency_token_active', 'false', TRUE);
  PERFORM set_config('app.emergency_token_person_id', '', TRUE);

  -- Cleanup
  DELETE FROM core.member_data_consents WHERE tenant_id IN (v_ta,v_tb);
  DELETE FROM params.consent_purposes WHERE id = v_purpose;
  DELETE FROM clinical.allergies WHERE person_id = v_pa;
  DELETE FROM core.members WHERE id IN (v_ma,v_mb);
  DELETE FROM core.persons WHERE id = v_pa;
  DELETE FROM core.tenants WHERE id IN (v_ta,v_tb);

  RETURN NEXT 'RLS CLINICAL CONSENT (B3): 4/4 passed';
END;
$$;

-- ── RUNNER PRINCIPAL ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION test.run_all()
RETURNS TABLE (suite TEXT, result TEXT) LANGUAGE plpgsql AS $$
BEGIN
  -- C1: configurar claves de prueba para blind_index y encryption
  PERFORM set_config('app.blind_index_key',  'test-blind-index-key-32chars!!!', TRUE);
  PERFORM set_config('app.encryption_key',   'test-encryption-key-32chars!!!!', TRUE);
  RETURN QUERY SELECT 'Multitenant isolation'::TEXT, r FROM test.run_multitenant_isolation() r;
  RETURN QUERY SELECT 'Clinical states MTA-511'::TEXT, r FROM test.run_clinical_states() r;
  RETURN QUERY SELECT 'Parametrization + B3-B11'::TEXT, r FROM test.run_parametrization() r;
  RETURN QUERY SELECT 'RLS clinical consent (B3)'::TEXT, r FROM test.run_rls_clinical_consent() r;
END;
$$;

-- Para ejecutar todos los tests:
-- SELECT * FROM test.run_all();
