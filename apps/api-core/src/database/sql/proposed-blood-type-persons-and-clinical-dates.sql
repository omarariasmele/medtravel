-- ============================================================
-- Pedido explícito del usuario:
-- 1. "Grupo Sanguineo no es un signo vital es una condicion basica...
--    no cambia, siempre es el mismo" — se saca de clinical.vitals_history
--    (donde vivía junto a peso/altura, que SÍ son mediciones repetibles)
--    y pasa a core.persons.blood_type_id, mismo patrón que gender_id: un
--    solo valor por persona, se actualiza in-place, no un historial.
--    La columna vieja en vitals_history queda (no se borra: filas ya
--    escritas, append-only) pero deja de usarse para escrituras nuevas.
-- 2. "Cuando muestra las alergias no aparece la fecha en que fue
--    detectada" — clinical.allergies no tenía NINGUNA columna de fecha
--    clínica (solo created_at/updated_at, que es cuándo se cargó el
--    registro, no cuándo empezó la alergia).
-- ============================================================

ALTER TABLE core.persons ADD COLUMN IF NOT EXISTS blood_type_id UUID REFERENCES params.catalog_values(id);

ALTER TABLE clinical.allergies ADD COLUMN IF NOT EXISTS onset_date DATE;

-- Backfill: el grupo sanguíneo más reciente ya cargado en el historial
-- de signos vitales pasa a ser el valor fijo de la persona.
UPDATE core.persons p
SET blood_type_id = latest.blood_type_id
FROM (
  SELECT DISTINCT ON (person_id) person_id, blood_type_id
  FROM clinical.vitals_history
  WHERE blood_type_id IS NOT NULL AND deleted_at IS NULL
  ORDER BY person_id, measured_at DESC
) latest
WHERE p.id = latest.person_id AND p.blood_type_id IS NULL;

-- clinical.get_patient_summary(): agrega blood_type_id — usada tanto
-- por admin-web (PatientSummaryCard) como por la ficha QR
-- (shared-profile.helper.ts), un solo cambio sirve para ambas. DROP
-- primero porque cambia el RETURNS TABLE (mismo motivo que las otras
-- funciones de esta sesión con "cannot change return type").
DROP FUNCTION IF EXISTS clinical.get_patient_summary(UUID);
CREATE OR REPLACE FUNCTION clinical.get_patient_summary(p_person_id UUID)
RETURNS TABLE (
  first_name           TEXT,
  last_name            TEXT,
  birth_date           DATE,
  gender_id            UUID,
  country_residence_id UUID,
  photo_path            TEXT,
  blood_type_id         UUID
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
    p.country_residence_id,
    p.photo_path,
    p.blood_type_id
  FROM core.persons p
  WHERE p.id = p_person_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION clinical.get_patient_summary(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION clinical.get_patient_summary(UUID)
  TO app_runtime, test_runner;
