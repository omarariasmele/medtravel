-- ============================================================
-- Pedido explícito del usuario: "cuando se borra el usuario no se
-- debería borrar su historial de consumo de IA porque si se vuelve a
-- dar de alta el usuario tenemos que mantener qué consumo venimos
-- teniendo" — core.delete_test_traveler_admin (proposed-delete-test-
-- traveler.sql) borra ai.conversations/messages/proposals/
-- interview_sessions ANTES de borrar core.persons, únicamente porque
-- person_id ahí es NOT NULL sin ON DELETE, y Postgres rechaza el
-- DELETE de core.persons con "viola la llave foránea" si esas filas
-- siguen apuntando a la persona. El dato de costo/tokens en sí
-- (ai.messages.estimated_cost_usd/tokens_*) no tiene ninguna razón
-- para desaparecer solo porque la CUENTA se dio de baja — ya se gastó
-- de verdad en OpenAI (mismo criterio que ya se aplicó en
-- reset_health_record_admin, proposed-health-record-reset-fix.sql,
-- para el caso de un reset parcial de ficha).
--
-- Se cambian las 4 FK de person_id (ai.conversations/messages/
-- proposals/interview_sessions) a NULLABLE + ON DELETE SET NULL en vez
-- de borrar las filas — el gasto/consumo queda huérfano (sin nombre
-- de persona) pero PRESENTE para siempre en los totales del dashboard
-- de Consumo de IA (ai.get_platform_summary/get_daily_trend/
-- get_intake_model_comparison no dependen de un JOIN a core.persons,
-- solo ai.get_top_users lo hace — esa fila simplemente deja de listar
-- a la persona ya borrada, sin afectar el resto de los totales).
--
-- NO resuelve todavía "si la misma persona se vuelve a registrar,
-- reengancharle el consumo viejo" — eso necesitaría una clave estable
-- (ver core.external_identifiers, ya usada para evitar altas
-- duplicadas por documento+país en proposed-travelers-without-tenant-
-- function.sql/gap #32) para volver a vincular las filas huérfanas al
-- nuevo person_id. Queda pendiente de decisión de producto, este
-- parche solo evita que el historial se pierda de entrada.
-- ============================================================

ALTER TABLE ai.conversations ALTER COLUMN person_id DROP NOT NULL;
ALTER TABLE ai.conversations DROP CONSTRAINT conversations_person_id_fkey;
ALTER TABLE ai.conversations
  ADD CONSTRAINT conversations_person_id_fkey
  FOREIGN KEY (person_id) REFERENCES core.persons(id) ON DELETE SET NULL;

ALTER TABLE ai.messages ALTER COLUMN person_id DROP NOT NULL;
ALTER TABLE ai.messages DROP CONSTRAINT messages_person_id_fkey;
ALTER TABLE ai.messages
  ADD CONSTRAINT messages_person_id_fkey
  FOREIGN KEY (person_id) REFERENCES core.persons(id) ON DELETE SET NULL;

ALTER TABLE ai.proposals ALTER COLUMN person_id DROP NOT NULL;
ALTER TABLE ai.proposals DROP CONSTRAINT proposals_person_id_fkey;
ALTER TABLE ai.proposals
  ADD CONSTRAINT proposals_person_id_fkey
  FOREIGN KEY (person_id) REFERENCES core.persons(id) ON DELETE SET NULL;

ALTER TABLE ai.interview_sessions ALTER COLUMN person_id DROP NOT NULL;
ALTER TABLE ai.interview_sessions DROP CONSTRAINT interview_sessions_person_id_fkey;
ALTER TABLE ai.interview_sessions
  ADD CONSTRAINT interview_sessions_person_id_fkey
  FOREIGN KEY (person_id) REFERENCES core.persons(id) ON DELETE SET NULL;

-- core.delete_test_traveler_admin ya NO borra ai.* a mano: con las FK
-- de arriba, el DELETE FROM core.persons del final de la función deja
-- esas filas con person_id = NULL en vez de fallar o borrarlas. Se
-- reproduce el cuerpo COMPLETO y actual de la función (mismo patrón ya
-- usado en proposed-treatment-type.sql al agregar clinical.treatments)
-- sacando únicamente el bloque de DELETE FROM ai.*.
CREATE OR REPLACE FUNCTION core.delete_test_traveler_admin(p_person_id UUID)
RETURNS TABLE (table_name TEXT, deleted_count INT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core, clinical, ai, coverage, emergency, operations AS $$
DECLARE
  v_count INT;
  v_user_id UUID;
  v_member_id UUID;
BEGIN
  SELECT id INTO v_user_id FROM core.users WHERE person_id = p_person_id;
  SELECT id INTO v_member_id FROM core.members WHERE person_id = p_person_id;

  IF v_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM operations.operators WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'No se puede eliminar: esta persona tiene una cuenta de operador (staff) asociada.';
  END IF;
  IF v_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM clinical.healthcare_professionals WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'No se puede eliminar: esta persona está registrada como profesional de salud.';
  END IF;

  -- Ficha de salud — reusa la función ya probada en vez de duplicar su
  -- lógica.
  FOR table_name, deleted_count IN SELECT * FROM clinical.reset_health_record_admin(p_person_id) LOOP
    RETURN NEXT;
  END LOOP;

  -- Pedido explícito del usuario: el historial de consumo/costo de IA
  -- (ai.conversations/messages/proposals/interview_sessions) YA NO se
  -- borra acá — queda huérfano (person_id = NULL vía ON DELETE SET
  -- NULL, ver arriba) cuando se borre core.persons más abajo, en vez
  -- de perderse. Antes SÍ hacía falta borrarlo a mano por la FK NOT
  -- NULL sin ON DELETE (ver comentario viejo, ya no aplica).

  -- Decisión explícita del usuario: clinical.vitals_history es un
  -- historial médico-legal permanente (FORCE ROW LEVEL SECURITY +
  -- sin GRANT de UPDATE/DELETE a ningún rol de app, ni siquiera desde
  -- reset_health_record_admin de arriba) — nunca se toca para un
  -- viajero real. Pero ESTA función es explícitamente para cuentas de
  -- PRUEBA que se borran y se vuelven a crear una y otra vez; dejar
  -- las mediciones viejas dando vueltas (visibles en el Historial de
  -- Salud de la cuenta "nueva" si comparte nombre) confunde las
  -- pruebas. Esta función corre como SECURITY DEFINER con dueño
  -- superusuario (bypassea RLS incluso con FORCE) — es la ÚNICA
  -- excepción en toda la base a la regla de "nunca se borra".
  DELETE FROM clinical.vitals_history WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'clinical.vitals_history'; deleted_count := v_count; RETURN NEXT;

  -- clinical.* que reset_health_record_admin no toca (documentos, consultas).
  DELETE FROM clinical.document_ai_processing WHERE document_id IN (SELECT id FROM clinical.documents WHERE person_id = p_person_id);
  DELETE FROM clinical.document_shares WHERE document_id IN (SELECT id FROM clinical.documents WHERE person_id = p_person_id);
  DELETE FROM clinical.documents WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'clinical.documents'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM emergency.access_log WHERE person_id = p_person_id OR member_id = v_member_id;
  DELETE FROM emergency.token_usage_log WHERE token_id IN (
    SELECT id FROM emergency.tokens WHERE person_id = p_person_id OR member_id = v_member_id
  );
  DELETE FROM emergency.share_note_drafts WHERE person_id = p_person_id;
  DELETE FROM emergency.tokens WHERE person_id = p_person_id OR member_id = v_member_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'emergency.tokens'; deleted_count := v_count; RETURN NEXT;
  IF v_member_id IS NOT NULL THEN
    DELETE FROM emergency.profiles WHERE member_id = v_member_id;
    DELETE FROM emergency.signed_offline_access WHERE member_id = v_member_id;
  END IF;

  DELETE FROM clinical.record_review_tasks WHERE submission_id IN (SELECT id FROM clinical.encounter_submissions WHERE person_id = p_person_id);
  DELETE FROM clinical.encounter_submissions WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'clinical.encounter_submissions'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.encounter_locations WHERE encounter_id IN (SELECT id FROM clinical.encounters WHERE person_id = p_person_id);
  DELETE FROM clinical.encounters WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'clinical.encounters'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM clinical.vaccines WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'clinical.vaccines'; deleted_count := v_count; RETURN NEXT;

  IF v_member_id IS NOT NULL THEN
    DELETE FROM operations.case_location_history WHERE case_id IN (SELECT id FROM operations.emergency_cases WHERE member_id = v_member_id);
    DELETE FROM operations.case_medical_events WHERE case_id IN (SELECT id FROM operations.emergency_cases WHERE member_id = v_member_id);
    DELETE FROM operations.case_participants WHERE case_id IN (SELECT id FROM operations.emergency_cases WHERE member_id = v_member_id);
    DELETE FROM operations.case_sla_log WHERE case_id IN (SELECT id FROM operations.emergency_cases WHERE member_id = v_member_id);
    DELETE FROM operations.case_status_history WHERE case_id IN (SELECT id FROM operations.emergency_cases WHERE member_id = v_member_id);
    DELETE FROM operations.message_reads WHERE channel_id IN (SELECT id FROM operations.chat_channels WHERE case_id IN (SELECT id FROM operations.emergency_cases WHERE member_id = v_member_id));
    DELETE FROM operations.message_attachments WHERE channel_id IN (SELECT id FROM operations.chat_channels WHERE case_id IN (SELECT id FROM operations.emergency_cases WHERE member_id = v_member_id));
    DELETE FROM operations.chat_translations WHERE message_id IN (SELECT id FROM operations.chat_messages WHERE channel_id IN (SELECT id FROM operations.chat_channels WHERE case_id IN (SELECT id FROM operations.emergency_cases WHERE member_id = v_member_id)));
    DELETE FROM operations.chat_messages WHERE channel_id IN (SELECT id FROM operations.chat_channels WHERE case_id IN (SELECT id FROM operations.emergency_cases WHERE member_id = v_member_id));
    DELETE FROM operations.chat_channels WHERE case_id IN (SELECT id FROM operations.emergency_cases WHERE member_id = v_member_id);
    DELETE FROM operations.operator_audit_log WHERE case_id IN (SELECT id FROM operations.emergency_cases WHERE member_id = v_member_id);
    DELETE FROM operations.tenant_access_requests WHERE case_id IN (SELECT id FROM operations.emergency_cases WHERE member_id = v_member_id);
    DELETE FROM operations.emergency_cases WHERE member_id = v_member_id;
    GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'operations.emergency_cases'; deleted_count := v_count; RETURN NEXT;

    DELETE FROM operations.trip_destinations WHERE trip_id IN (SELECT id FROM operations.trips WHERE member_id = v_member_id);
    DELETE FROM operations.trips WHERE member_id = v_member_id;
    GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'operations.trips'; deleted_count := v_count; RETURN NEXT;

    DELETE FROM core.member_declared_policies WHERE member_id = v_member_id;

    DELETE FROM coverage.coverage_acquisition_channels WHERE enrollment_id IN (SELECT id FROM coverage.travel_assistance_enrollments WHERE member_id = v_member_id);
    DELETE FROM coverage.coverage_eligibility_verifications WHERE enrollment_id IN (SELECT id FROM coverage.travel_assistance_enrollments WHERE member_id = v_member_id);
    DELETE FROM coverage.coverage_sync_events WHERE enrollment_id IN (SELECT id FROM coverage.travel_assistance_enrollments WHERE member_id = v_member_id);
    DELETE FROM coverage.member_card_benefit_links WHERE enrollment_id IN (SELECT id FROM coverage.travel_assistance_enrollments WHERE member_id = v_member_id);
    DELETE FROM coverage.travel_assistance_certificates WHERE enrollment_id IN (SELECT id FROM coverage.travel_assistance_enrollments WHERE member_id = v_member_id);
    DELETE FROM coverage.travel_assistance_enrollments WHERE member_id = v_member_id;
    GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'coverage.travel_assistance_enrollments'; deleted_count := v_count; RETURN NEXT;
  END IF;

  DELETE FROM coverage.health_coverages WHERE person_id = p_person_id OR member_id = v_member_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'coverage.health_coverages'; deleted_count := v_count; RETURN NEXT;

  UPDATE coverage.healthcare_plans SET submitted_by_person_id = NULL WHERE submitted_by_person_id = p_person_id;
  UPDATE coverage.healthcare_providers SET submitted_by_person_id = NULL WHERE submitted_by_person_id = p_person_id;
  IF v_user_id IS NOT NULL THEN
    UPDATE ai.knowledge_base_entries SET created_by = NULL WHERE created_by = v_user_id;
    UPDATE params.app_settings SET updated_by = NULL WHERE updated_by = v_user_id;
  END IF;

  IF v_member_id IS NOT NULL THEN
    UPDATE core.member_contacts SET linked_member_id = NULL WHERE linked_member_id = v_member_id;
    DELETE FROM core.identity_match_decisions WHERE member_id = v_member_id;
    DELETE FROM core.member_data_consents WHERE member_id = v_member_id;
    DELETE FROM core.member_contacts WHERE member_id = v_member_id;
  END IF;
  DELETE FROM core.identity_match_decisions WHERE candidate_id IN (SELECT id FROM core.identity_match_candidates WHERE person_id = p_person_id);

  UPDATE core.partner_member_records
  SET import_status_id = params.catalog_id('IMPORT_STATUS', 'NO_MATCH')
  WHERE id IN (SELECT partner_record_id FROM core.identity_match_candidates WHERE person_id = p_person_id);

  DELETE FROM core.identity_match_candidates WHERE person_id = p_person_id;
  DELETE FROM core.member_contacts WHERE person_id = p_person_id;

  DELETE FROM core.members WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'core.members'; deleted_count := v_count; RETURN NEXT;

  DELETE FROM core.external_identifiers WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'core.external_identifiers'; deleted_count := v_count; RETURN NEXT;

  IF v_user_id IS NOT NULL THEN
    DELETE FROM core.authentication_credentials WHERE user_id = v_user_id;
    DELETE FROM core.email_verification_codes WHERE user_id = v_user_id;
    DELETE FROM core.mfa_methods WHERE user_id = v_user_id;
    DELETE FROM core.password_reset_tokens WHERE user_id = v_user_id;
    DELETE FROM core.security_sessions WHERE user_id = v_user_id;
    DELETE FROM core.users WHERE id = v_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'core.users'; deleted_count := v_count; RETURN NEXT;
  END IF;

  DELETE FROM core.persons WHERE id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'core.persons'; deleted_count := v_count; RETURN NEXT;

  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION core.delete_test_traveler_admin(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.delete_test_traveler_admin(UUID) TO medtravel_app;
