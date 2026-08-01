-- ============================================================
-- Totales de consumo de IA a nivel plataforma (todos los usuarios),
-- para el chequeo de presupuesto diario/mensual (AI_DAILY_BUDGET_USD/
-- AI_MONTHLY_BUDGET_USD) pedido por el usuario ("poder alertar
-- cualquier anomalía de consumo"). RLS en ai.messages solo deja ver
-- "lo propio" a un viajero — este chequeo necesita el TOTAL de todos,
-- por eso es SECURITY DEFINER, mismo patrón ya usado en el resto del
-- sistema para lecturas controladas que cruzan el límite de RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION ai.get_consumption_totals()
RETURNS TABLE(cost_today NUMERIC, cost_this_month NUMERIC)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ai, pg_temp
AS $$
  SELECT
    COALESCE(SUM(estimated_cost_usd) FILTER (WHERE created_at >= date_trunc('day', now())), 0),
    COALESCE(SUM(estimated_cost_usd) FILTER (WHERE created_at >= date_trunc('month', now())), 0)
  FROM ai.messages
  WHERE sender = 'ASSISTANT';
$$;

GRANT EXECUTE ON FUNCTION ai.get_consumption_totals() TO app_runtime;
