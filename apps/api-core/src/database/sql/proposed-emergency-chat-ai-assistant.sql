-- ============================================================
-- IA en el chat de emergencia — pedido explícito del usuario: "el
-- primer contacto deberia manejarlo la IA... informando que se ha
-- contactado con el asistente de IA de la App, y que este lo ayudara
-- en todo lo que sea posible y en caso de que necesite contactarse con
-- un operador, este lo derivara". La idea es que la app sea lo más
-- autosuficiente posible.
--
-- Diseño: la IA escribe en el MISMO operations.chat_messages que ya
-- usa el chat humano (no un log paralelo) — así un operador que toma
-- el caso ve la charla completa con la IA, no arranca de cero. La IA
-- responde automáticamente a los mensajes del viajero mientras NINGÚN
-- operador humano esté activo en el caso; en cuanto un operador se une
-- (tryAutoJoinAsOperator, events.gateway.ts), la IA deja de contestar.
-- ============================================================

-- CASE_PRIORITY solo tenía sembrado MEDIUM (gap real, encontrado
-- investigando esto) — la IA necesita poder escalar prioridad cuando
-- deriva a un operador.
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.label_es, v.label_en, v.display_order, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
CROSS JOIN (VALUES
  ('LOW',      'Baja',    'Low',      1),
  ('MEDIUM',   'Media',   'Medium',   2),
  ('HIGH',     'Alta',    'High',     3),
  ('CRITICAL', 'Crítica', 'Critical', 4)
) AS v(code, label_es, label_en, display_order)
WHERE dc.code = 'CASE_PRIORITY'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = dc.id AND cv.code = v.code
  );

-- CHAT_SENDER_TYPE solo tenía MEMBER/OPERATOR — falta el emisor IA.
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, 'AI_ASSISTANT', 'Asistente de IA', 'AI assistant', 3, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
WHERE dc.code = 'CHAT_SENDER_TYPE'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = dc.id AND cv.code = 'AI_ASSISTANT'
  );

-- ── Base de conocimiento del asistente ──────────────────────────
-- Editable desde admin-web sin recompilar ni redeployar — pedido
-- explícito del usuario ("tendriamos que tener dentro de la WEB algo
-- para ir cargando [información]"). MVP: se manda TODO lo activo al
-- prompt de la IA en cada charla (no hay tantas entradas todavía como
-- para justificar búsqueda/RAG real) — si crece mucho, revisar.
CREATE TABLE IF NOT EXISTS ai.knowledge_base_entries (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT         NOT NULL,
  content     TEXT         NOT NULL,
  active      BOOLEAN      NOT NULL DEFAULT TRUE,
  created_by  UUID         REFERENCES core.users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Sin RLS propia — mismo criterio que params.app_settings (gap #68):
-- no es dato de un tenant ni PII, es contenido de plataforma. Lectura
-- abierta a cualquier usuario autenticado (el backend arma el prompt
-- de la IA con esto); escritura restringida por ConfigAccessGuard.
GRANT SELECT, INSERT, UPDATE, DELETE ON ai.knowledge_base_entries TO app_runtime, test_runner;

-- ── Inserción de mensajes IA/sistema sin pasar por RLS de usuario ──
-- msg_insert (007_operations.sql) exige que app.current_user_id sea un
-- case_participant activo con can_send_messages — correcto para un
-- request real de un viajero/operador, pero la IA responde en un
-- proceso de background disparado por events.gateway.ts, sin esa
-- identidad. SECURITY DEFINER, mismo patrón que
-- create_member_emergency_case(). También mantiene
-- chat_channels.message_count/last_message_at/last_message_preview al
-- día, igual que hace handleSendMessage() a mano.
CREATE OR REPLACE FUNCTION operations.insert_system_chat_message(
  p_channel_id UUID,
  p_case_id UUID,
  p_sender_type_code TEXT,
  p_sender_name TEXT,
  p_content TEXT
)
RETURNS SETOF operations.chat_messages
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, operations, params AS $$
DECLARE
  v_message_id UUID;
BEGIN
  INSERT INTO operations.chat_messages
    (channel_id, case_id, sender_type_id, sender_id, sender_name,
     message_type_id, content, status_id)
  VALUES (
    p_channel_id, p_case_id,
    params.catalog_id('CHAT_SENDER_TYPE', p_sender_type_code),
    NULL, p_sender_name,
    params.catalog_id('CHAT_MESSAGE_TYPE', 'TEXT'),
    p_content,
    params.catalog_id('CHAT_MESSAGE_STATUS', 'SENT')
  )
  RETURNING id INTO v_message_id;

  UPDATE operations.chat_channels
  SET message_count = message_count + 1,
      last_message_at = NOW(),
      last_message_preview = LEFT(p_content, 100),
      updated_at = NOW()
  WHERE id = p_channel_id;

  RETURN QUERY SELECT * FROM operations.chat_messages WHERE id = v_message_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION operations.insert_system_chat_message(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION operations.insert_system_chat_message(UUID, UUID, TEXT, TEXT, TEXT)
  TO app_runtime, test_runner;

-- ── Escalar prioridad al derivar a un operador ──────────────────
-- SECURITY DEFINER por el mismo motivo — la IA decide esto en un
-- request disparado por el propio viajero (sin permiso de operador).
CREATE OR REPLACE FUNCTION operations.escalate_case_priority(p_case_id UUID, p_priority_code TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, operations, params AS $$
BEGIN
  UPDATE operations.emergency_cases
  SET priority_id = params.catalog_id('CASE_PRIORITY', p_priority_code),
      updated_at = NOW()
  WHERE id = p_case_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION operations.escalate_case_priority(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION operations.escalate_case_priority(UUID, TEXT)
  TO app_runtime, test_runner;
