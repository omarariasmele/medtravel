-- ============================================================
-- Pedido explícito del usuario: recordarle al viajero que actualice su
-- Historial de Salud si pasaron muchos días desde la última vez —
-- número de días editable desde admin-web (Parámetros de la app) sin
-- recompilar, mismo mecanismo ya usado para voz/pausa del asistente.
-- ============================================================

INSERT INTO params.app_settings (setting_key, setting_value, description_es)
VALUES (
  'health.reminder_days',
  '60',
  'Días desde la última actualización del Historial de Salud a partir de los cuales se le recuerda al viajero que revise si hay novedades (app y asistentes de IA).'
)
ON CONFLICT (setting_key) DO NOTHING;
