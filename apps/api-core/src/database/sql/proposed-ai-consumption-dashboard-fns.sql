-- ============================================================
-- Funciones de soporte para el dashboard de consumo de IA
-- (operations/ai-consumption en admin-web) — pedido explícito del
-- usuario: "ir monitoreando el consumo de agentes de IA en costos o
-- token... poder tener consumo por usuario activo... veremos un
-- promedio de consumo quien consumió más que otro".
--
-- Todas SECURITY DEFINER porque necesitan cruzar el límite de RLS de
-- ai.messages (que solo deja ver "lo propio" a un viajero) — el
-- controller que las llama ya valida canManageConfig antes de invocarlas
-- (ConfigAccessGuard, mismo patrón que el resto de pantallas de
-- plataforma), así que acá no hace falta repetir ese chequeo.
-- ============================================================

CREATE OR REPLACE FUNCTION ai.get_platform_summary()
RETURNS TABLE(
  cost_today NUMERIC,
  cost_this_month NUMERIC,
  messages_today BIGINT,
  messages_this_month BIGINT,
  active_conversations_today BIGINT,
  proposals_pending BIGINT,
  proposals_confirmed BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ai, pg_temp
AS $$
  SELECT
    COALESCE((SELECT SUM(estimated_cost_usd) FROM ai.messages WHERE sender = 'ASSISTANT' AND created_at >= date_trunc('day', now())), 0),
    COALESCE((SELECT SUM(estimated_cost_usd) FROM ai.messages WHERE sender = 'ASSISTANT' AND created_at >= date_trunc('month', now())), 0),
    (SELECT COUNT(*) FROM ai.messages WHERE sender = 'USER' AND created_at >= date_trunc('day', now())),
    (SELECT COUNT(*) FROM ai.messages WHERE sender = 'USER' AND created_at >= date_trunc('month', now())),
    (SELECT COUNT(DISTINCT conversation_id) FROM ai.messages WHERE created_at >= date_trunc('day', now())),
    (SELECT COUNT(*) FROM ai.proposals WHERE status = 'PENDING_CONFIRMATION'),
    (SELECT COUNT(*) FROM ai.proposals WHERE status = 'CONFIRMED');
$$;

GRANT EXECUTE ON FUNCTION ai.get_platform_summary() TO app_runtime;

-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai.get_top_users(p_days INT DEFAULT 30, p_limit INT DEFAULT 20)
RETURNS TABLE(
  person_id UUID,
  first_name TEXT,
  last_name TEXT,
  message_count BIGINT,
  tokens_input BIGINT,
  tokens_output BIGINT,
  cost_usd NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ai, core, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.person_id,
    core.decrypt_pii(p.first_name),
    core.decrypt_pii(p.last_name),
    COUNT(*) FILTER (WHERE m.sender = 'USER'),
    COALESCE(SUM(m.tokens_input), 0),
    COALESCE(SUM(m.tokens_output), 0),
    COALESCE(SUM(m.estimated_cost_usd), 0)
  FROM ai.messages m
  JOIN core.persons p ON p.id = m.person_id
  WHERE m.created_at >= now() - (p_days || ' days')::INTERVAL
  GROUP BY m.person_id, p.first_name, p.last_name
  ORDER BY COALESCE(SUM(m.estimated_cost_usd), 0) DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION ai.get_top_users(INT, INT) TO app_runtime;

-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION ai.get_daily_trend(p_days INT DEFAULT 14)
RETURNS TABLE(day DATE, cost_usd NUMERIC, message_count BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ai, pg_temp
AS $$
  SELECT
    d::DATE,
    COALESCE(SUM(m.estimated_cost_usd) FILTER (WHERE m.sender = 'ASSISTANT'), 0),
    COUNT(m.id) FILTER (WHERE m.sender = 'USER')
  FROM generate_series(
    date_trunc('day', now()) - ((p_days - 1) || ' days')::INTERVAL,
    date_trunc('day', now()),
    '1 day'::INTERVAL
  ) d
  LEFT JOIN ai.messages m ON date_trunc('day', m.created_at) = d
  GROUP BY d
  ORDER BY d;
$$;

GRANT EXECUTE ON FUNCTION ai.get_daily_trend(INT) TO app_runtime;
