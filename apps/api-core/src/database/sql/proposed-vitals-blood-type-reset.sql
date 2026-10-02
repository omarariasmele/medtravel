-- ============================================================
-- Bug real reportado en vivo: "Borrar todos los antecedentes de salud"
-- (clinical.reset_health_record_admin, proposed-health-record-reset-
-- fix.sql) borra clinical.vitals_history (peso/altura) y resetea
-- health_record_last_updated_at, pero NUNCA tocaba
-- core.persons.blood_type_id — el grupo sanguíneo vive ahí directo
-- (valor fijo, no histórico, ver proposed-blood-type-persons-and-
-- clinical-dates.sql) desde que se sacó de vitals_history, y el reset
-- se escribió antes de ese cambio.
--
-- Efecto observado: con el grupo sanguíneo todavía cargado después de
-- "borrar todo", getPersonContext() (ai.service.ts) seguía viendo
-- hasClinicalData = true (blood_type_code no nulo) y
-- health_record_last_updated_at volvía a quedar con una fecha real en
-- cuanto se tocaba cualquier dato de nuevo — el asistente Estructurado
-- (voz) saludaba "Bienvenido, la última actualización fue hace un
-- mes" para una ficha que se acababa de vaciar por completo.
-- ============================================================

CREATE OR REPLACE FUNCTION clinical.reset_health_record_admin(p_person_id UUID)
RETURNS TABLE (table_name TEXT, deleted_count INT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, clinical, ai, core AS $$
DECLARE
  v_count INT;
BEGIN
  DELETE FROM clinical.conditions WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'conditions'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.allergies WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'allergies'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.medications WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'medications'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.surgeries WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'surgeries'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.implants_devices WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'implants_devices'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.treatments WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'treatments'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.vitals_history WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'vitals_history'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.lab_results WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'lab_results'; deleted_count := v_count; RETURN NEXT;

  -- Bug real encontrado en esta misma sesión: el grupo sanguíneo
  -- (core.persons.blood_type_id) nunca se limpiaba acá — ver
  -- comentario de arriba.
  UPDATE core.persons SET blood_type_id = NULL WHERE id = p_person_id;

  UPDATE core.persons SET health_record_last_updated_at = NULL WHERE id = p_person_id;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION clinical.reset_health_record_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinical.reset_health_record_admin(UUID) TO medtravel_app;
