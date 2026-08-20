-- ============================================================
-- Pedido explícito del usuario: mostrar en la ficha médica del panel
-- la fecha de última actualización del Historial de Salud. core.persons
-- es self-access-only (RLS) — un operador viendo la ficha de OTRO
-- viajero no puede leerla con un SELECT directo; tiene que salir de
-- clinical.get_patient_summary() (SECURITY DEFINER, ya usada para el
-- resto de estos datos demográficos), no de una consulta aparte.
-- ============================================================

DROP FUNCTION IF EXISTS clinical.get_patient_summary(UUID);

CREATE FUNCTION clinical.get_patient_summary(p_person_id UUID)
RETURNS TABLE (
  first_name TEXT,
  last_name TEXT,
  birth_date DATE,
  gender_id UUID,
  country_residence_id UUID,
  photo_path TEXT,
  blood_type_id UUID,
  health_record_last_updated_at TIMESTAMPTZ
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
    p.blood_type_id,
    p.health_record_last_updated_at
  FROM core.persons p
  WHERE p.id = p_person_id;
END;
$$;
