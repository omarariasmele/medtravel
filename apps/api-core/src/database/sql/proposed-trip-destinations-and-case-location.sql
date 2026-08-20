-- ============================================================
-- Gap #53: no había forma de cargar el destino (país/ciudad) de un
-- viaje desde la app, ni de vincular un caso de asistencia a una
-- ubicación (país/ciudad) automática al reportar una emergencia —
-- pedido explícito del usuario: al presionar "Reportar emergencia" se
-- intenta GPS primero (geocodificado 100% en el dispositivo, sin
-- servicio externo), si no está disponible se usa el destino del
-- viaje activo, y si tampoco hay eso, se pide país/ciudad a mano antes
-- de poder enviar el caso.
--
-- operations.emergency_cases ya tenía las columnas trip_id/
-- destination_id/destination_detected_by_id declaradas (007_operations.sql)
-- pero nunca se usaban. destination_detected_by_id no tenía ningún
-- dominio de catálogo asociado (no existía en absoluto). destination_
-- status_id (NOT NULL en trip_destinations) tenía el dominio declarado
-- pero sin ningún valor sembrado — mismo patrón que BLOOD_TYPE (gap #50).
-- ============================================================

INSERT INTO params.domain_catalogs (code, name_es, name_en, description_es, is_system)
SELECT 'DESTINATION_DETECTED_BY', 'Origen de la ubicación detectada', 'Detected location source',
       'Cómo se determinó el país/ciudad de un caso de asistencia', TRUE
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs WHERE code = 'DESTINATION_DETECTED_BY');

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.label_es, v.label_en, v.display_order, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
CROSS JOIN (VALUES
  ('TRIP',   'Viaje cargado',        'Loaded trip',        1),
  ('GPS',    'GPS del dispositivo',  'Device GPS',          2),
  ('MANUAL', 'Ingresado a mano',     'Manually entered',    3)
) AS v(code, label_es, label_en, display_order)
WHERE dc.code = 'DESTINATION_DETECTED_BY'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = dc.id AND cv.code = v.code
  );

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.label_es, v.label_en, v.display_order, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
CROSS JOIN (VALUES
  ('ACTIVE',    'Activo',     'Active',    1),
  ('COMPLETED', 'Completado', 'Completed', 2)
) AS v(code, label_es, label_en, display_order)
WHERE dc.code = 'DESTINATION_STATUS'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = dc.id AND cv.code = v.code
  );

-- operations.create_member_emergency_case(): se agrega p_country_id/
-- p_city (ambos opcionales) y la lógica de resolución de destination_id
-- descripta arriba. CREATE OR REPLACE con más parámetros crea un
-- OVERLOAD nuevo en vez de reemplazar — hay que borrar la firma vieja
-- de 8 parámetros explícitamente, si no el controller (que ahora manda
-- 10) puede convivir con una firma vieja huérfana y confundir a
-- cualquier otro caller que siga usando 8.
DROP FUNCTION IF EXISTS operations.create_member_emergency_case(UUID,UUID,TEXT,TEXT,BOOLEAN,NUMERIC,NUMERIC,NUMERIC);

CREATE OR REPLACE FUNCTION operations.create_member_emergency_case(
  p_person_id UUID,
  p_member_id UUID,
  p_initial_description TEXT,
  p_patient_symptoms TEXT,
  p_patient_conscious BOOLEAN,
  p_latitude NUMERIC,
  p_longitude NUMERIC,
  p_location_accuracy NUMERIC,
  p_country_id UUID DEFAULT NULL,
  p_city TEXT DEFAULT NULL
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
  v_destination_id UUID;
  v_detected_by_id UUID;
  v_trip_id UUID;
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

  -- Resolución de ubicación: reusar un destino de viaje activo hoy con
  -- el mismo país si existe; si no, crear un destino "ad hoc" (y su
  -- viaje contenedor) con lo que se pudo determinar (GPS o manual).
  IF p_country_id IS NOT NULL THEN
    SELECT td.id, td.trip_id INTO v_destination_id, v_trip_id
    FROM operations.trip_destinations td
    JOIN operations.trips t ON t.id = td.trip_id
    WHERE t.member_id = p_member_id
      AND td.country_id = p_country_id
      AND td.arrival_date <= CURRENT_DATE
      AND td.departure_date >= CURRENT_DATE
    ORDER BY td.created_at DESC
    LIMIT 1;

    IF v_destination_id IS NOT NULL THEN
      v_detected_by_id := params.catalog_id('DESTINATION_DETECTED_BY', 'TRIP');
    ELSE
      INSERT INTO operations.trips (member_id, trip_name, trip_start, trip_end, status_id, notes)
      VALUES (
        p_member_id, 'Viaje detectado por evento', CURRENT_DATE, CURRENT_DATE,
        params.catalog_id('TRIP_STATUS', 'PLANNED'),
        'Creado automáticamente al reportar una emergencia sin viaje activo cargado.'
      )
      RETURNING operations.trips.id INTO v_trip_id;

      INSERT INTO operations.trip_destinations (
        trip_id, member_id, country_id, city, latitude, longitude,
        arrival_date, departure_date, sequence_order, status_id
      )
      VALUES (
        v_trip_id, p_member_id, p_country_id, COALESCE(p_city, ''), p_latitude, p_longitude,
        CURRENT_DATE, CURRENT_DATE, 1,
        params.catalog_id('DESTINATION_STATUS', 'ACTIVE')
      )
      RETURNING operations.trip_destinations.id INTO v_destination_id;

      v_detected_by_id := CASE
        WHEN p_latitude IS NOT NULL THEN params.catalog_id('DESTINATION_DETECTED_BY', 'GPS')
        ELSE params.catalog_id('DESTINATION_DETECTED_BY', 'MANUAL')
      END;
    END IF;
  END IF;

  INSERT INTO operations.emergency_cases (
    member_id, tenant_id, origin_id, priority_id, status_id,
    initial_description, patient_symptoms, patient_conscious,
    incident_latitude, incident_longitude, incident_location_acc,
    location_source_id, trip_id, destination_id, destination_detected_by_id
  )
  VALUES (
    p_member_id, v_tenant_id,
    params.catalog_id('CASE_ORIGIN', 'APP'),
    params.catalog_id('CASE_PRIORITY', 'MEDIUM'),
    params.catalog_id('CASE_STATUS', 'OPEN'),
    p_initial_description, p_patient_symptoms, p_patient_conscious,
    p_latitude, p_longitude, p_location_accuracy,
    CASE WHEN p_latitude IS NOT NULL THEN params.catalog_id('LOCATION_SOURCE', 'GPS') END,
    v_trip_id, v_destination_id, v_detected_by_id
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
REVOKE EXECUTE ON FUNCTION operations.create_member_emergency_case(UUID,UUID,TEXT,TEXT,BOOLEAN,NUMERIC,NUMERIC,NUMERIC,UUID,TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION operations.create_member_emergency_case(UUID,UUID,TEXT,TEXT,BOOLEAN,NUMERIC,NUMERIC,NUMERIC,UUID,TEXT) TO app_runtime, test_runner;
