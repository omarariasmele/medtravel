-- ============================================================
-- Pedido explícito del usuario: "un usuario se podría colgar jugando
-- con la app y generar un consumo por exceso" — tope de consumo
-- GRATUITO de IA por usuario y por año (a diferencia de
-- AI_DAILY_BUDGET_USD/AI_MONTHLY_BUDGET_USD, que son de toda la
-- plataforma, no por persona). Editable desde admin-web (Parámetros de
-- la app) sin recompilar, mismo mecanismo que health.reminder_days —
-- ver AIService.userFreeUsageExceeded/checkLimits.
--
-- Por ahora solo bloquea (mensaje sin costo, "cargá el dato manual
-- mientras tanto") — vender "ampliaciones de uso de IA" con un modelo
-- de planes queda pendiente de definir (pedido explícito del usuario,
-- fuera de alcance de este cambio).
-- ============================================================

INSERT INTO params.app_settings (setting_key, setting_value, description_es)
VALUES (
  'ai.free_usage_limit_usd',
  '5',
  'Consumo máximo gratuito de IA por usuario, por año calendario, en USD. Al superarlo, el asistente de IA (texto y voz) deja de responder y sugiere cargar los datos manualmente hasta el próximo año o hasta que existan planes de ampliación.'
)
ON CONFLICT (setting_key) DO NOTHING;
