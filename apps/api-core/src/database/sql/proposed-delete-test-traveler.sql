-- ============================================================
-- Pedido explícito del usuario: "podés poner un botón en el usuario
-- para darlo de baja con toda su info, así podemos hacer pruebas
-- reiteradas con un mismo usuario" — a diferencia de
-- clinical.reset_health_record_admin() (que solo vacía la ficha de
-- salud y deja el perfil/cuenta intactos), esto borra la cuenta de
-- viajero COMPLETA para poder registrarla de cero.
--
-- Mapeado a mano contra pg_constraint (71 tablas dependen transitiva-
-- mente de core.persons/users/members) para separar lo que es dato
-- PROPIO del viajero (se borra) de lo que es dato COMPARTIDO donde el
-- viajero solo aparece como atribución (se desvincula, NUNCA se
-- borra la fila — ej. un healthcare_plan que este viajero cargó
-- también lo puede estar usando otra persona real).
--
-- Guardas explícitas: se niega a borrar si la persona tiene una
-- cuenta de operador (staff) o está registrada como profesional de
-- salud — esas cuentas nunca deberían pasar por acá, este botón es
-- solo para viajeros de prueba.
--
-- Mismo patrón que reset_health_record_admin: SECURITY DEFINER para
-- saltar los *_no_delete USING (false) de las tablas clínicas
-- (protección médico-legal real, no un bug) — solo alcanzable desde
-- un endpoint gateado con ConfigAccessGuard, nunca expuesto directo.
-- ============================================================

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

  -- Bug real reportado en vivo: "viola la llave foránea
  -- conversations_person_id_fkey" al dar de baja la cuenta completa —
  -- reset_health_record_admin (arriba) DEJÓ de borrar ai.* este mismo
  -- día (pedido explícito del usuario: un reset parcial de ficha no
  -- debe borrar el historial de costo/consumo de IA). Pero ESTA
  -- función es una baja COMPLETA de la cuenta — acá sí hay que borrar
  -- todo, incluidas las conversaciones, para poder borrar la persona
  -- sin dejar filas huérfanas. Mismo orden que tenía
  -- reset_health_record_admin antes (proposals/messages referencian a
  -- conversations, van primero).
  DELETE FROM ai.proposals WHERE person_id = p_person_id;
  DELETE FROM ai.messages WHERE person_id = p_person_id;
  DELETE FROM ai.interview_sessions WHERE person_id = p_person_id;
  DELETE FROM ai.conversations WHERE person_id = p_person_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'ai.conversations'; deleted_count := v_count; RETURN NEXT;

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

  -- Bug real reportado en vivo: "viola la llave foránea
  -- share_note_drafts_claimed_encounter_submission_id_fkey" —
  -- emergency.share_note_drafts.claimed_encounter_submission_id
  -- apunta a clinical.encounter_submissions, así que el borrado de
  -- emergency.* (que antes iba MÁS ABAJO, después de encounter_
  -- submissions) tiene que pasar ANTES de tocar esa tabla. Se sube
  -- todo el bloque emergency.* acá arriba, antes de cualquier
  -- clinical.encounter_submissions/encounters.
  -- Bug real reportado en vivo: "viola la llave foránea
  -- tokens_member_id_fkey" — emergency.tokens.member_id es la columna
  -- ORIGINAL (siempre poblada cuando el viajero tiene member, ver
  -- proposed-emergency-tokens-person-id.sql); person_id se agregó
  -- DESPUÉS solo como alternativa para viajeros SIN member — filtrar
  -- nada más que por person_id se salteaba los tokens de un viajero
  -- CON member (el caso normal). Se filtra por los dos.
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

  -- operations.* — casos de emergencia y viajes de ESTE miembro
  -- (nunca operadores/turnos de guardia, eso es de staff).
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

    -- Bug real reportado en vivo: "viola la llave foránea
    -- member_declared_policies_resulting_enrollment_id_fkey" —
    -- core.member_declared_policies.resulting_enrollment_id apunta a
    -- coverage.travel_assistance_enrollments, así que tiene que
    -- borrarse ANTES (antes vivía más abajo, junto al resto de
    -- identidad, después de que enrollments ya se había borrado).
    DELETE FROM core.member_declared_policies WHERE member_id = v_member_id;

    -- coverage.* — SOLO inscripciones propias del miembro. Nunca se
    -- toca coverage.healthcare_plans/healthcare_providers/card_issuers/
    -- assistance_plans: son catálogo compartido, otros viajeros reales
    -- pueden estar usándolos.
    DELETE FROM coverage.coverage_acquisition_channels WHERE enrollment_id IN (SELECT id FROM coverage.travel_assistance_enrollments WHERE member_id = v_member_id);
    DELETE FROM coverage.coverage_eligibility_verifications WHERE enrollment_id IN (SELECT id FROM coverage.travel_assistance_enrollments WHERE member_id = v_member_id);
    DELETE FROM coverage.coverage_sync_events WHERE enrollment_id IN (SELECT id FROM coverage.travel_assistance_enrollments WHERE member_id = v_member_id);
    DELETE FROM coverage.member_card_benefit_links WHERE enrollment_id IN (SELECT id FROM coverage.travel_assistance_enrollments WHERE member_id = v_member_id);
    DELETE FROM coverage.travel_assistance_certificates WHERE enrollment_id IN (SELECT id FROM coverage.travel_assistance_enrollments WHERE member_id = v_member_id);
    DELETE FROM coverage.travel_assistance_enrollments WHERE member_id = v_member_id;
    GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'coverage.travel_assistance_enrollments'; deleted_count := v_count; RETURN NEXT;
  END IF;

  -- Bug real reportado en vivo: "viola la llave foránea
  -- health_coverages_member_id_fkey" al dar de baja la cuenta completa
  -- — coverage.health_coverages puede estar vinculada por member_id,
  -- por person_id, o por los dos (ver proposed-healthcare-plans.sql,
  -- que agregó person_id nullable y sacó el NOT NULL de member_id).
  -- Filtrar solo por person_id salteaba filas vinculadas nada más que
  -- por member_id — mismo criterio ya usado para emergency.tokens más
  -- arriba.
  DELETE FROM coverage.health_coverages WHERE person_id = p_person_id OR member_id = v_member_id;
  GET DIAGNOSTICS v_count = ROW_COUNT; table_name := 'coverage.health_coverages'; deleted_count := v_count; RETURN NEXT;

  -- Atribución en tablas COMPARTIDAS: se desvincula, la fila en sí
  -- nunca se borra (otro viajero real puede depender de ella).
  UPDATE coverage.healthcare_plans SET submitted_by_person_id = NULL WHERE submitted_by_person_id = p_person_id;
  UPDATE coverage.healthcare_providers SET submitted_by_person_id = NULL WHERE submitted_by_person_id = p_person_id;
  IF v_user_id IS NOT NULL THEN
    UPDATE ai.knowledge_base_entries SET created_by = NULL WHERE created_by = v_user_id;
    UPDATE params.app_settings SET updated_by = NULL WHERE updated_by = v_user_id;
  END IF;

  -- core.* identidad — member_contacts primero (linked_member_id
  -- puede apuntar A este miembro desde el contacto de otro), después
  -- el resto de la ficha de identidad.
  IF v_member_id IS NOT NULL THEN
    UPDATE core.member_contacts SET linked_member_id = NULL WHERE linked_member_id = v_member_id;
    DELETE FROM core.identity_match_decisions WHERE member_id = v_member_id;
    DELETE FROM core.member_data_consents WHERE member_id = v_member_id;
    DELETE FROM core.member_contacts WHERE member_id = v_member_id;
  END IF;
  DELETE FROM core.identity_match_decisions WHERE candidate_id IN (SELECT id FROM core.identity_match_candidates WHERE person_id = p_person_id);

  -- Bug real reportado en vivo: "Marcelo Lopez tiene una póliza pero
  -- al darlo de baja y de alta no la empareja nuevamente" — dar de
  -- baja acá SOLO borraba el candidato de match (arriba) y el
  -- external_identifier (abajo), pero nunca tocaba
  -- core.partner_member_records.import_status_id, que se había
  -- quedado en 'MATCHED' desde el primer alta. Como
  -- try_match_pending_records_for_person (ver
  -- proposed-partner-matching-function.sql) SOLO reintenta emparejar
  -- registros en 'NO_MATCH', esa póliza quedaba huérfana para
  -- siempre — nadie con ese documento podía volver a emparejarla,
  -- ni la misma persona re-registrándose con el mismo DNI+país
  -- (no puede haber otro Marcelo Lopez con igual documento). Se
  -- vuelve a 'NO_MATCH' para que la próxima carga de documento con
  -- ese DNI la encuentre de nuevo.
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
