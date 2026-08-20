-- ============================================================
-- Pedido explícito del usuario: comparar costo real de IA entre el
-- modelo Clásico (conversacional, ai.conversations.intake_model =
-- 'CLASSIC') y el modelo Estructurado (guiado por tabla, 'STRUCTURED')
-- para decidir cuál conviene después de probar ambos en una demo.
-- Mismo patrón que ai.get_daily_trend()/get_top_users()
-- (proposed-ai-consumption-dashboard-fns.sql).
-- ============================================================

CREATE OR REPLACE FUNCTION ai.get_intake_model_comparison(p_days INT DEFAULT 30)
RETURNS TABLE(
  intake_model         TEXT,
  conversations        BIGINT,
  messages             BIGINT,
  tokens_input         BIGINT,
  tokens_output        BIGINT,
  cost_usd             NUMERIC,
  avg_cost_per_conversation NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ai, pg_temp
AS $$
  SELECT
    c.intake_model,
    COUNT(DISTINCT c.id),
    COUNT(m.id),
    COALESCE(SUM(m.tokens_input), 0),
    COALESCE(SUM(m.tokens_output), 0),
    COALESCE(SUM(m.estimated_cost_usd), 0),
    CASE WHEN COUNT(DISTINCT c.id) = 0 THEN 0
         ELSE COALESCE(SUM(m.estimated_cost_usd), 0) / COUNT(DISTINCT c.id)
    END
  FROM ai.conversations c
  LEFT JOIN ai.messages m ON m.conversation_id = c.id
  WHERE c.conversation_type = 'HEALTH_DATA_CAPTURE'
    AND c.created_at >= now() - (p_days || ' days')::INTERVAL
  GROUP BY c.intake_model;
$$;

GRANT EXECUTE ON FUNCTION ai.get_intake_model_comparison(INT) TO app_runtime;
