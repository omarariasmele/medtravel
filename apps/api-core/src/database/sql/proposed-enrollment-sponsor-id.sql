-- ============================================================
-- Gap #47: coverage.travel_assistance_enrollments.sponsor_id (FK a
-- coverage.coverage_sponsors) nunca se seteaba al crear el enrollment
-- — ni en core._apply_partner_match() (match automático por documento)
-- ni en core.assign_plan_to_partner_record() (gap #45, asignar plan a
-- mano). Reportado por el usuario con captura real: la tabla "Plan de
-- asistencia al viajero" en la ficha del viajero mostraba "—" en la
-- columna "Empresa de asistencia (sponsor)" pese a tener plan y N° de
-- póliza cargados.
--
-- Derivación: cada coverage_sponsors.tenant_id corresponde a UN solo
-- tenant real de asistencia (AXA/Universal Assistance/Assit Card, ver
-- gap #44) y coverage.assistance_plans.tenant_id es ese mismo tenant
-- — alcanza con buscar el sponsor cuyo tenant_id coincida con el del
-- plan que se está enrolando.
-- ============================================================

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
  v_sponsor   UUID;
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
    SELECT id INTO v_sponsor FROM coverage.coverage_sponsors WHERE tenant_id = v_record.tenant_id AND active = TRUE LIMIT 1;
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
      member_id, tenant_id, plan_id, sponsor_id, policy_number, valid_from, valid_until,
      status_id, status_authority, verification_source_id, last_verified_at
    ) VALUES (
      v_member, v_record.tenant_id, v_plan, v_sponsor, v_record.policy_number,
      v_record.valid_from, v_record.valid_until,
      params.catalog_id('ENROLLMENT_STATUS', 'ACTIVE'), 'PARTNER_API',
      params.catalog_id('VERIFICATION_SOURCE', 'PARTNER_UPLOAD'), NOW()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE core.partner_member_records
  SET import_status_id = params.catalog_id('IMPORT_STATUS', CASE WHEN v_plan IS NOT NULL THEN 'MATCHED' ELSE 'MATCHED_NO_PLAN' END)
  WHERE id = p_partner_record_id;

  RETURN QUERY SELECT v_member;
END;
$$;
REVOKE EXECUTE ON FUNCTION core._apply_partner_match(UUID, UUID) FROM PUBLIC;

CREATE OR REPLACE FUNCTION core.assign_plan_to_partner_record(
  p_partner_record_id UUID,
  p_plan_code TEXT
)
RETURNS TABLE (ok BOOLEAN, enrollment_id UUID)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, coverage, params AS $$
DECLARE
  v_record     core.partner_member_records%ROWTYPE;
  v_member     UUID;
  v_plan       UUID;
  v_sponsor    UUID;
  v_enrollment UUID;
BEGIN
  SELECT * INTO v_record FROM core.partner_member_records WHERE id = p_partner_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'assign_plan_to_partner_record: partner_record_id no existe';
  END IF;

  SELECT d.member_id INTO v_member
  FROM core.identity_match_candidates c
  JOIN core.identity_match_decisions d ON d.candidate_id = c.id
  WHERE c.partner_record_id = p_partner_record_id
    AND d.decision_id = params.catalog_id('MATCH_DECISION', 'APPROVED')
  ORDER BY d.decided_at DESC LIMIT 1;

  IF v_member IS NULL THEN
    RETURN QUERY SELECT FALSE, NULL::UUID;
    RETURN;
  END IF;

  SELECT id INTO v_plan
  FROM coverage.assistance_plans
  WHERE tenant_id = v_record.tenant_id AND code = p_plan_code AND active = TRUE;

  IF v_plan IS NULL THEN
    RAISE EXCEPTION 'assign_plan_to_partner_record: no existe un plan con code=% para este tenant', p_plan_code;
  END IF;

  SELECT id INTO v_sponsor FROM coverage.coverage_sponsors WHERE tenant_id = v_record.tenant_id AND active = TRUE LIMIT 1;

  INSERT INTO coverage.travel_assistance_enrollments (
    member_id, tenant_id, plan_id, sponsor_id, policy_number, valid_from, valid_until,
    status_id, status_authority, verification_source_id, last_verified_at
  ) VALUES (
    v_member, v_record.tenant_id, v_plan, v_sponsor, v_record.policy_number,
    v_record.valid_from, v_record.valid_until,
    params.catalog_id('ENROLLMENT_STATUS', 'ACTIVE'), 'PARTNER_API',
    params.catalog_id('VERIFICATION_SOURCE', 'PARTNER_UPLOAD'), NOW()
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_enrollment;

  UPDATE core.partner_member_records
  SET plan_code = p_plan_code,
      import_status_id = params.catalog_id('IMPORT_STATUS', 'MATCHED')
  WHERE id = p_partner_record_id;

  RETURN QUERY SELECT TRUE, v_enrollment;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.assign_plan_to_partner_record(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.assign_plan_to_partner_record(UUID, TEXT) TO app_runtime, test_runner;

-- Backfill de los enrollments ya existentes que quedaron con sponsor_id NULL.
UPDATE coverage.travel_assistance_enrollments e
SET sponsor_id = s.id
FROM coverage.assistance_plans p
JOIN coverage.coverage_sponsors s ON s.tenant_id = p.tenant_id AND s.active = TRUE
WHERE e.plan_id = p.id
  AND e.sponsor_id IS NULL;
