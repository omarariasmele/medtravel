-- ============================================================
-- Gap real encontrado por el usuario al revisar la vista previa "como
-- la vería el médico": faltaba la membresía del servicio de asistencia
-- al viajero (empresa, plan, N° de póliza, vigencia) — el médico
-- necesita saber ANTES de ver antecedentes médicos si el paciente tiene
-- cobertura vigente y de qué empresa, para poder coordinar con la
-- asistencia. coverage.travel_assistance_enrollments tiene su propia
-- RLS (tenant_id / current_person_id, ver 004_coverage.sql) que NO
-- contempla el camino de token de emergencia ni gateo por
-- has_clinical_access — mismo problema ya resuelto para
-- emergency_contacts (emergency.get_shared_contacts): puente puntual
-- SECURITY DEFINER, mismo patrón.
-- ============================================================

CREATE OR REPLACE FUNCTION emergency.get_shared_membership(p_person_id UUID)
RETURNS TABLE (
  tenant_name      TEXT,
  plan_name        TEXT,
  policy_number    TEXT,
  valid_from       DATE,
  valid_until      DATE,
  status_authority TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, emergency, clinical, core, coverage, params AS $$
BEGIN
  IF NOT clinical.has_clinical_access(p_person_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.name::TEXT, ap.name::TEXT, tae.policy_number::TEXT,
         tae.valid_from, tae.valid_until, tae.status_authority::TEXT
  FROM coverage.travel_assistance_enrollments tae
  JOIN core.members m ON m.id = tae.member_id
  LEFT JOIN coverage.assistance_plans ap ON ap.id = tae.plan_id
  LEFT JOIN core.tenants t ON t.id = tae.tenant_id
  WHERE m.person_id = p_person_id
  ORDER BY tae.valid_until DESC;
END;
$$;
REVOKE EXECUTE ON FUNCTION emergency.get_shared_membership(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION emergency.get_shared_membership(UUID)
  TO app_runtime, test_runner;
