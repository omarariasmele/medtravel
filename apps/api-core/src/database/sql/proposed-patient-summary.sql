-- ============================================================
-- Gap real encontrado en "Historia clínica" (dentro de un caso): faltan
-- datos demográficos básicos del viajero (sexo, fecha de
-- nacimiento/edad, nacionalidad/país) para tener una visión completa
-- al momento de la asistencia — hoy solo se ven alergias/condiciones/
-- medicamentos, ninguno de los cuales incluye esto.
--
-- core.persons es self-access-only (persons_self_access, 003_core_
-- identity.sql) por diseño — "el acceso del tenant es solo a través de
-- core.members", nunca un findById() genérico. Para no romper eso pero
-- igual permitir que un operador con un caso ABIERTO vea los datos
-- básicos del paciente, se agrega esta función puntual SECURITY
-- DEFINER que reutiliza EXACTAMENTE el mismo chequeo de acceso que ya
-- protege alergias/condiciones/medicamentos/vitals
-- (clinical.has_clinical_access) — mismo modelo de permisos, no uno
-- nuevo, y sigue auditado igual que el resto del acceso clínico.
-- ============================================================

CREATE OR REPLACE FUNCTION clinical.get_patient_summary(p_person_id UUID)
RETURNS TABLE (
  first_name           TEXT,
  last_name            TEXT,
  birth_date           DATE,
  gender_id            UUID,
  country_residence_id UUID
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, clinical, core AS $$
BEGIN
  IF NOT clinical.has_clinical_access(p_person_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    core.decrypt_pii(p.first_name),
    core.decrypt_pii(p.last_name),
    p.birth_date,
    p.gender_id,
    p.country_residence_id
  FROM core.persons p
  WHERE p.id = p_person_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION clinical.get_patient_summary(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION clinical.get_patient_summary(UUID)
  TO app_runtime, test_runner;
