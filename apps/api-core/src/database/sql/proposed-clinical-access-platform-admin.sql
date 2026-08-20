-- ============================================================
-- Gap #49: clinical.has_clinical_access() nunca tenía en cuenta que el
-- tenant logueado fuera el administrador de la plataforma (OYSGROUP,
-- core.tenants.is_platform_admin, gap #43) — un operador de OYSGROUP
-- solo veía la historia clínica de viajeros cuyo core.members.tenant_id
-- fuera también OYSGROUP (camino #4, consentimiento "para este
-- tenant"). Al reasignar viajeros de OYSGROUP a una empresa de
-- asistencia real (AXA, gap #47), el operador de OYSGROUP dejó de
-- poder ver su historia clínica — comportamiento correcto según el
-- modelo de acceso, pero no lo que el usuario quiere: OYSGROUP,
-- como administrador de la plataforma, necesita poder ver la historia
-- clínica de CUALQUIER viajero (soporte), sin importar de qué empresa
-- de asistencia real sea miembro.
--
-- Se agrega un camino más (antes del chequeo de consentimiento por
-- tenant, mismo lugar donde ya vive el resto de los caminos de
-- acceso): si el tenant logueado tiene is_platform_admin = TRUE,
-- acceso total. Mismo patrón que otras excepciones de "administrador
-- de plataforma" ya usadas en el sistema (ej. core.
-- has_platform_config_access() para SMTP).
-- ============================================================

CREATE OR REPLACE FUNCTION clinical.has_clinical_access(p_person_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'clinical', 'core', 'audit', 'app', 'params', 'operations'
AS $function$
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

  -- 3.5 (gap #49). Administrador de la plataforma: soporte cross-tenant.
  IF v_tenant IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM core.tenants WHERE id = v_tenant AND is_platform_admin = TRUE
    ) THEN
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
$function$;
