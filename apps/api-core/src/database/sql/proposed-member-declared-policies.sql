-- ============================================================
-- Pedido del usuario: cuando el viajero se registra en la app y todavía
-- no hay una póliza cargada por la empresa (core.partner_member_records)
-- que lo matchee, debe poder declarar él mismo su número de póliza —
-- pero eso NO puede crear directamente un
-- coverage.travel_assistance_enrollments real (plan_id es NOT NULL ahí,
-- y el viajero no sabe/no debe elegir el plan exacto de la empresa).
-- Se modela igual que el patrón ya usado para notas de médico sin
-- registrar (draft → aprobación → promoción a la tabla real), acá
-- aplicado a "declaración propia de póliza → aprobación por la empresa
-- → enrollment real".
-- ============================================================

CREATE TABLE core.member_declared_policies (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id       UUID         NOT NULL REFERENCES core.members(id),
  tenant_id       UUID         NOT NULL REFERENCES core.tenants(id),
  policy_number   VARCHAR(100) NOT NULL,
  declared_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  approved_at     TIMESTAMPTZ,
  approved_by     UUID,
  rejected_at     TIMESTAMPTZ,
  rejected_by     UUID,
  rejection_reason TEXT,
  -- Se completa recién cuando la empresa aprueba y elige el plan real.
  resulting_enrollment_id UUID REFERENCES coverage.travel_assistance_enrollments(id)
);

CREATE INDEX idx_member_declared_pending
  ON core.member_declared_policies(tenant_id)
  WHERE approved_at IS NULL AND rejected_at IS NULL;

ALTER TABLE core.member_declared_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.member_declared_policies FORCE ROW LEVEL SECURITY;

CREATE POLICY member_declared_policies_access ON core.member_declared_policies
  USING (
    tenant_id = app.current_uuid('app.current_tenant_id')
    OR core.current_operator_can_manage_config()
    OR member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
  )
  WITH CHECK (
    tenant_id = app.current_uuid('app.current_tenant_id')
    OR core.current_operator_can_manage_config()
    OR member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
  );

GRANT SELECT, INSERT, UPDATE ON core.member_declared_policies TO app_runtime;

-- ── Lista pública (para cualquier viajero autenticado) de empresas
-- activas para elegir "quién me asegura" — solo id+nombre, nunca el
-- resto de columnas de core.tenants (contacto, razón social, etc.),
-- que sí siguen protegidas por la RLS normal de esa tabla.
CREATE OR REPLACE FUNCTION core.list_active_companies()
RETURNS TABLE (id UUID, name VARCHAR)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name
  FROM core.tenants t
  WHERE t.active = TRUE AND t.is_platform_tenant = FALSE
  ORDER BY t.name;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.list_active_companies() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.list_active_companies()
  TO app_runtime, test_runner;

-- ── Declarar la propia póliza (viajero) ───────────────────────
-- Crea el member si todavía no existe para ese tenant (igual que
-- create_member_emergency_case) — sin esto, un viajero que declara una
-- póliza de una empresa donde nunca tuvo membership no tendría dónde
-- colgar la declaración.
CREATE OR REPLACE FUNCTION core.declare_member_policy(
  p_person_id UUID,
  p_tenant_id UUID,
  p_policy_number TEXT
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, params AS $$
DECLARE
  v_member UUID;
  v_id     UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM core.tenants WHERE id = p_tenant_id AND active = TRUE AND is_platform_tenant = FALSE) THEN
    RAISE EXCEPTION 'declare_member_policy: empresa inválida';
  END IF;

  SELECT id INTO v_member FROM core.members
  WHERE person_id = p_person_id AND tenant_id = p_tenant_id;

  IF v_member IS NULL THEN
    INSERT INTO core.members (person_id, tenant_id, status_id, onboarding_completed)
    VALUES (p_person_id, p_tenant_id, params.catalog_id('MEMBER_STATUS', 'PENDING'), FALSE)
    RETURNING id INTO v_member;
  END IF;

  INSERT INTO core.member_declared_policies (member_id, tenant_id, policy_number)
  VALUES (v_member, p_tenant_id, p_policy_number)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.declare_member_policy(UUID, UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.declare_member_policy(UUID, UUID, TEXT)
  TO app_runtime, test_runner;

-- ── Aprobar una declaración (operador de la empresa) ──────────
-- Recién acá se elige el plan real — el viajero nunca lo eligió, porque
-- no tiene por qué conocer el catálogo interno de planes de la empresa.
CREATE OR REPLACE FUNCTION core.approve_member_declared_policy(
  p_declared_id UUID,
  p_plan_id UUID,
  p_valid_from DATE,
  p_valid_until DATE,
  p_approved_by UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, coverage, params AS $$
DECLARE
  v_declared core.member_declared_policies%ROWTYPE;
  v_enrollment UUID;
BEGIN
  SELECT * INTO v_declared FROM core.member_declared_policies WHERE id = p_declared_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'approve_member_declared_policy: declaración no encontrada';
  END IF;
  IF v_declared.approved_at IS NOT NULL OR v_declared.rejected_at IS NOT NULL THEN
    RAISE EXCEPTION 'approve_member_declared_policy: ya fue resuelta';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM coverage.assistance_plans WHERE id = p_plan_id AND tenant_id = v_declared.tenant_id) THEN
    RAISE EXCEPTION 'approve_member_declared_policy: el plan no pertenece a esta empresa';
  END IF;

  INSERT INTO coverage.travel_assistance_enrollments (
    member_id, tenant_id, plan_id, policy_number, valid_from, valid_until,
    status_id, status_authority, verification_source_id, last_verified_at
  ) VALUES (
    v_declared.member_id, v_declared.tenant_id, p_plan_id, v_declared.policy_number,
    p_valid_from, p_valid_until,
    params.catalog_id('ENROLLMENT_STATUS', 'ACTIVE'), 'LOCAL_RECORD',
    params.catalog_id('VERIFICATION_SOURCE', 'PARTNER_UPLOAD'), NOW()
  ) RETURNING id INTO v_enrollment;

  UPDATE core.member_declared_policies
  SET approved_at = NOW(), approved_by = p_approved_by, resulting_enrollment_id = v_enrollment
  WHERE id = p_declared_id;

  UPDATE core.members SET status_id = params.catalog_id('MEMBER_STATUS', 'ACTIVE')
  WHERE id = v_declared.member_id;

  RETURN v_enrollment;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.approve_member_declared_policy(UUID, UUID, DATE, DATE, UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.approve_member_declared_policy(UUID, UUID, DATE, DATE, UUID)
  TO app_runtime, test_runner;
