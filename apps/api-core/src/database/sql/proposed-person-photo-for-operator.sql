-- ============================================================
-- Gap #41: la foto de perfil en "Usuarios"/"Usuarios sin cobertura"
-- (traveler-detail.page.tsx) nunca se veía aunque el viajero SÍ la
-- había subido — GET /clinical/patient-photo/:personId está gateado
-- por clinical.has_clinical_access (caso abierto o consentimiento),
-- el criterio correcto para la vista QR/médico, pero NO para esta
-- pantalla: acá la foto es un dato de identidad básico, mismo nivel
-- que nombre/teléfono/email/documento (gap #13/#37/#38/#40), que un
-- operador de ESE tenant ya puede ver sin necesitar consentimiento
-- clínico. Mismo patrón exacto que esos — nueva función +
-- GET /identity/persons/:id/photo, endpoint separado del clínico
-- (que sigue existiendo tal cual para share-preview/public-share).
-- ============================================================

CREATE OR REPLACE FUNCTION core.get_person_photo_path_for_operator(p_person_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, app AS $$
DECLARE
  v_photo_path TEXT;
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM core.members m
      WHERE m.person_id = p_person_id
        AND m.tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  ) THEN
    RETURN NULL;
  END IF;

  SELECT p.photo_path INTO v_photo_path
  FROM core.persons p
  WHERE p.id = p_person_id;

  RETURN v_photo_path;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.get_person_photo_path_for_operator(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.get_person_photo_path_for_operator(UUID) TO app_runtime, test_runner;
