-- ============================================================
-- Paso 2 del brief (app Flutter): el viajero necesita poder iniciar un
-- caso de asistencia desde la app, no solo que un operador lo cargue.
-- Gap encontrado: /operations/emergency-cases (RlsCrudService genérico)
-- SÍ deja insertar el caso (cases_access permite member_id propio), pero
-- operations.case_participants_insert es deliberadamente solo para
-- operador/superadmin ("gestión de participantes es tarea de operador,
-- no del viajero" — proposed-tenant-access-model.sql) — así que un
-- INSERT directo del viajero dejaría el caso creado pero SIN el viajero
-- como participante, y sin ser participante no puede entrar a la sala
-- de chat de su propio caso (events.gateway.ts valida
-- is_active_case_participant en cada join).
--
-- Esta función resuelve exactamente ese único caso: crea el caso Y agrega
-- al viajero como participante, atómicamente, sin abrir la política
-- general de case_participants_insert a los viajeros (que sigue
-- reservada a gestión de operador para el resto de los casos). Mismo
-- patrón que el resto de las funciones SECURITY DEFINER de este schema
-- (core.register_person_and_user, operations.get_operator_login_context).
-- ============================================================

CREATE OR REPLACE FUNCTION operations.create_member_emergency_case(
  p_person_id UUID,
  p_member_id UUID,
  p_initial_description TEXT,
  p_patient_symptoms TEXT,
  p_patient_conscious BOOLEAN,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_location_accuracy NUMERIC
)
RETURNS TABLE (
  id UUID,
  case_number TEXT,
  status_id UUID,
  created_at TIMESTAMPTZ,
  channel_id UUID
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, operations, core, params AS $$
DECLARE
  v_tenant_id UUID;
  v_case_id UUID;
  v_channel_id UUID;
  v_display_name TEXT;
BEGIN
  -- Última línea de defensa: esta función corre con privilegios de
  -- definer, no hereda la RLS de members_tenant_or_self, así que valida
  -- a mano que el member realmente sea del person_id que llama.
  SELECT m.tenant_id INTO v_tenant_id
  FROM core.members m
  WHERE m.id = p_member_id AND m.person_id = p_person_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No sos titular de ese member' USING ERRCODE = '42501';
  END IF;

  INSERT INTO operations.emergency_cases (
    member_id, tenant_id, origin_id, priority_id, status_id,
    initial_description, patient_symptoms, patient_conscious,
    incident_latitude, incident_longitude, incident_location_acc,
    location_source_id
  )
  VALUES (
    p_member_id, v_tenant_id,
    params.catalog_id('CASE_ORIGIN', 'APP'),
    params.catalog_id('CASE_PRIORITY', 'MEDIUM'),
    params.catalog_id('CASE_STATUS', 'OPEN'),
    p_initial_description, p_patient_symptoms, p_patient_conscious,
    p_latitude, p_longitude, p_location_accuracy,
    CASE WHEN p_latitude IS NOT NULL THEN params.catalog_id('LOCATION_SOURCE', 'GPS') END
  )
  RETURNING operations.emergency_cases.id INTO v_case_id;

  SELECT core.decrypt_pii(pe.first_name) || ' ' || core.decrypt_pii(pe.last_name)
  INTO v_display_name
  FROM core.persons pe
  WHERE pe.id = p_person_id;

  INSERT INTO operations.case_participants (
    case_id, participant_type_id, member_id, display_name,
    can_close_case, can_authorize_expenses
  )
  VALUES (
    v_case_id,
    params.catalog_id('CASE_PARTICIPANT_TYPE', 'MEMBER'),
    p_member_id,
    COALESCE(v_display_name, 'Viajero'),
    FALSE, FALSE
  );

  -- Sala de chat del caso — sin esto el viajero no tiene channel_id para
  -- unirse a events.gateway.ts (namespace 'cases', join_case/send_message).
  -- Ningún otro camino del schema creaba esta fila (gap real: el caso
  -- podía existir sin canal de chat).
  INSERT INTO operations.chat_channels (case_id, member_id, channel_type_id, status_id)
  VALUES (
    v_case_id, p_member_id,
    params.catalog_id('CHAT_CHANNEL_TYPE', 'CASE_MAIN'),
    params.catalog_id('CHAT_CHANNEL_STATUS', 'ACTIVE')
  )
  RETURNING operations.chat_channels.id INTO v_channel_id;

  RETURN QUERY
  SELECT ec.id, ec.case_number, ec.status_id, ec.created_at, v_channel_id
  FROM operations.emergency_cases ec
  WHERE ec.id = v_case_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION operations.create_member_emergency_case(UUID, UUID, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION operations.create_member_emergency_case(UUID, UUID, TEXT, TEXT, BOOLEAN, NUMERIC, NUMERIC, NUMERIC)
  TO app_runtime, test_runner;
