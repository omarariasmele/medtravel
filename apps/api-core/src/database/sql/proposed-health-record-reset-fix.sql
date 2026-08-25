-- ============================================================
-- Bug real encontrado de paso (no pedido explícito, pero bloqueante
-- para poder probar): el botón "Borrar antecedentes de salud" (Zona
-- de pruebas) ejecuta DELETE crudo contra clinical.conditions/
-- allergies/medications/surgeries/implants_devices — pero esas 5
-- tablas tienen DELETE bloqueado a nivel RLS a propósito
-- (*_no_delete USING (false), medico-legal: nunca se borra un dato
-- clínico de verdad) y el rol de runtime (medtravel_app) NO tiene
-- BYPASSRLS. El botón reportaba "listo" sin haber borrado ninguna
-- fila. Se resuelve igual que clinical.get_patient_summary(): una
-- función SECURITY DEFINER (corre como dueño de la función, no como
-- medtravel_app) que sí puede saltarse esa protección — solo
-- alcanzable desde el endpoint ya gateado con ConfigAccessGuard, no
-- expuesta de otra forma.
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

  -- Bug real reportado en vivo: "Borrar todos los antecedentes de
  -- salud" no borraba peso/mediciones ni análisis de sangre — quedaban
  -- vitals_history/lab_results colgados pese al mensaje de "se van a
  -- borrar TODAS las condiciones, alergias, medicamentos, cirugías e
  -- implantes" (que ya sugiere "todo", sin excluir estas dos).
  DELETE FROM clinical.vitals_history WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'vitals_history'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.lab_results WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  table_name := 'lab_results'; deleted_count := v_count; RETURN NEXT;

  -- Bug real reportado en vivo: "raro, me desapareció el consumo de
  -- IA de Marcelo de hoy" — este reset borraba también ai.proposals/
  -- messages/interview_sessions/conversations, así que cada vez que se
  -- usaba el botón de prueba para volver a cargar la ficha, el
  -- dashboard de Consumo de IA perdía TODO el historial de esa
  -- persona. El costo ya se gastó de verdad en OpenAI pase lo que pase
  -- con la ficha clínica después — un reset para volver a probar la
  -- carga no tiene por qué borrar el registro de auditoría/costo, así
  -- que ya no se toca ai.*.
  UPDATE core.persons SET health_record_last_updated_at = NULL WHERE id = p_person_id;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION clinical.reset_health_record_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION clinical.reset_health_record_admin(UUID) TO medtravel_app;
