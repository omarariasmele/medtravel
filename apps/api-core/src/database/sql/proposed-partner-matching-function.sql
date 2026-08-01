-- ============================================================
-- Carga y validación de pólizas: cuando la empresa de asistencia sube una
-- póliza (core.partner_member_records) o un viajero carga su documento
-- (core.external_identifiers), estas funciones intentan emparejarlos por
-- documento exacto. SECURITY DEFINER porque cruzan límites de tabla que
-- la RLS normal no dejaría (un viajero no tiene, ni debe tener, INSERT
-- directo en identity_match_candidates/decisions ni en core.members de
-- un tenant ajeno).
--
-- La clave de blind index NUNCA se guarda en Postgres (ni como GUC ni en
-- ninguna tabla) — sigue el mismo patrón que el resto del proyecto
-- (auth.service.ts, professionals-registration.controller.ts): vive
-- solo en DB_BLIND_INDEX_KEY del lado de NestJS, y se pasa como
-- parámetro explícito a core.blind_index() en cada llamada.
--
-- v1 es deliberadamente simple: SOLO match exacto por doc_number (mismo
-- doc_type). El campo confidence_score/evidence de identity_match_
-- candidates ya deja lugar para sumar matching difuso por nombre más
-- adelante sin tocar esta función de nuevo.
-- ============================================================

-- Lógica compartida: dado que YA se sabe que un partner_record y una
-- persona coinciden, hace el trabajo real (member, candidate, decision,
-- enrollment). No calcula ningún índice — eso lo hacen las dos funciones
-- públicas de más abajo, cada una a su manera.
CREATE OR REPLACE FUNCTION core._apply_partner_match(
  p_partner_record_id UUID,
  p_person_id UUID
)
RETURNS TABLE (member_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, coverage, params AS $$
DECLARE
  v_record    core.partner_member_records%ROWTYPE;
  v_member    UUID;
  v_plan      UUID;
  v_candidate UUID;
BEGIN
  SELECT * INTO v_record FROM core.partner_member_records WHERE id = p_partner_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '_apply_partner_match: partner_record_id no existe';
  END IF;

  IF v_record.plan_code IS NOT NULL THEN
    SELECT id INTO v_plan
    FROM coverage.assistance_plans
    WHERE tenant_id = v_record.tenant_id AND code = v_record.plan_code AND active = TRUE;
    IF v_plan IS NULL THEN
      RAISE EXCEPTION '_apply_partner_match: no existe un plan con code=% para este tenant', v_record.plan_code;
    END IF;
  END IF;

  SELECT id INTO v_member FROM core.members
  WHERE person_id = p_person_id AND tenant_id = v_record.tenant_id;

  IF v_member IS NULL THEN
    INSERT INTO core.members (person_id, tenant_id, status_id, onboarding_completed)
    VALUES (p_person_id, v_record.tenant_id, params.catalog_id('MEMBER_STATUS', 'ACTIVE'), FALSE)
    RETURNING id INTO v_member;
  END IF;

  INSERT INTO core.identity_match_candidates (
    partner_record_id, person_id, confidence_score, match_type_id, evidence, status_id
  ) VALUES (
    p_partner_record_id, p_person_id, 1.0,
    params.catalog_id('MATCH_TYPE', 'EXACT_DOC_NUMBER'),
    jsonb_build_object('docTypeCode', v_record.raw_doc_type),
    params.catalog_id('MATCH_CANDIDATE_STATUS', 'APPROVED')
  ) RETURNING id INTO v_candidate;

  INSERT INTO core.identity_match_decisions (
    candidate_id, member_id, decision_id, auto_resolved, decision_notes
  ) VALUES (
    v_candidate, v_member, params.catalog_id('MATCH_DECISION', 'APPROVED'), TRUE,
    'Match exacto por documento — auto-resuelto'
  );

  IF v_plan IS NOT NULL THEN
    INSERT INTO coverage.travel_assistance_enrollments (
      member_id, tenant_id, plan_id, policy_number, valid_from, valid_until,
      status_id, status_authority, verification_source_id, last_verified_at
    ) VALUES (
      v_member, v_record.tenant_id, v_plan, v_record.policy_number,
      v_record.valid_from, v_record.valid_until,
      params.catalog_id('ENROLLMENT_STATUS', 'ACTIVE'), 'PARTNER_API',
      params.catalog_id('VERIFICATION_SOURCE', 'PARTNER_UPLOAD'), NOW()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE core.partner_member_records
  SET import_status_id = params.catalog_id('IMPORT_STATUS', 'MATCHED')
  WHERE id = p_partner_record_id;

  RETURN QUERY SELECT v_member;
END;
$$;
REVOKE EXECUTE ON FUNCTION core._apply_partner_match(UUID, UUID) FROM PUBLIC;

-- Caso A: se acaba de cargar una póliza nueva — ¿ya existe un viajero
-- registrado con ese documento?
CREATE OR REPLACE FUNCTION core.try_match_partner_record(
  p_partner_record_id UUID,
  p_blind_index_key TEXT
)
RETURNS TABLE (matched BOOLEAN, member_id UUID, person_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, params AS $$
DECLARE
  v_record  core.partner_member_records%ROWTYPE;
  v_doc_idx TEXT;
  v_person  UUID;
  v_member  UUID;
BEGIN
  SELECT * INTO v_record FROM core.partner_member_records WHERE id = p_partner_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'try_match_partner_record: partner_record_id no existe';
  END IF;

  IF v_record.raw_doc_number IS NULL OR v_record.raw_doc_type IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  v_doc_idx := core.blind_index(core.decrypt_pii(v_record.raw_doc_number), p_blind_index_key);

  SELECT ei.person_id INTO v_person
  FROM core.external_identifiers ei
  JOIN params.catalog_values cv ON cv.id = ei.doc_type_id
  WHERE ei.doc_number_idx = v_doc_idx
    AND cv.code = v_record.raw_doc_type
    AND ei.active = TRUE
  LIMIT 1;

  IF v_person IS NULL THEN
    UPDATE core.partner_member_records
    SET import_status_id = params.catalog_id('IMPORT_STATUS', 'NO_MATCH')
    WHERE id = p_partner_record_id;
    RETURN QUERY SELECT FALSE, NULL::UUID, NULL::UUID;
    RETURN;
  END IF;

  SELECT m FROM core._apply_partner_match(p_partner_record_id, v_person) AS m INTO v_member;
  RETURN QUERY SELECT TRUE, v_member, v_person;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.try_match_partner_record(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.try_match_partner_record(UUID, TEXT)
  TO app_runtime, test_runner;

-- Caso B: el viajero acaba de cargar su documento — ¿hay alguna póliza
-- pendiente esperando ese documento (de cualquier empresa)? Devuelve los
-- partner_record_id que quedaron emparejados.
CREATE OR REPLACE FUNCTION core.try_match_pending_records_for_person(
  p_person_id UUID,
  p_doc_number_idx TEXT,
  p_doc_type_code TEXT,
  p_blind_index_key TEXT
)
RETURNS SETOF UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, params AS $$
DECLARE
  v_pending_id UUID;
BEGIN
  FOR v_pending_id IN
    SELECT pmr.id
    FROM core.partner_member_records pmr
    WHERE pmr.raw_doc_type = p_doc_type_code
      -- NO_MATCH, no PENDING: cada póliza intenta emparejar apenas se
      -- carga (try_match_partner_record), así que si no encontró a nadie
      -- en ese momento queda en NO_MATCH, no en PENDING — PENDING nunca
      -- llega a ser un estado terminal real en este flujo.
      AND pmr.import_status_id = params.catalog_id('IMPORT_STATUS', 'NO_MATCH')
      AND core.blind_index(core.decrypt_pii(pmr.raw_doc_number), p_blind_index_key) = p_doc_number_idx
  LOOP
    PERFORM core._apply_partner_match(v_pending_id, p_person_id);
    RETURN NEXT v_pending_id;
  END LOOP;
  RETURN;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.try_match_pending_records_for_person(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.try_match_pending_records_for_person(UUID, TEXT, TEXT, TEXT)
  TO app_runtime, test_runner;
