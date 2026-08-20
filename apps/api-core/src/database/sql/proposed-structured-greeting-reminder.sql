-- ============================================================
-- Pedido explícito del usuario: cuando pasaron muchos días desde la
-- última actualización del Historial de Salud (umbral configurable
-- en health.reminder_days, ya existente), el saludo del modelo
-- Estructurado tiene que preguntar explícitamente por novedades en
-- vez del saludo genérico de "actualización" — mismo mecanismo ya
-- usado para assistant.structured_greeting_new/_update (editable
-- desde admin-web, nunca hardcodeado). {firstName} y {lastUpdated}
-- se reemplazan en tiempo de ejecución (ver structuredIntakeChat en
-- ai.service.ts).
-- ============================================================

INSERT INTO params.app_settings (setting_key, setting_value, description_es)
VALUES (
  'assistant.structured_greeting_reminder',
  E'Hola {firstName}, soy su asistente virtual de Historial de Salud.\n\n' ||
  E'Veo que la última actualización fue el {lastUpdated} — ya pasó un buen tiempo. ¿Tenés alguna novedad de ' ||
  E'salud para contarme? Puede ser una enfermedad nueva, un cambio en tus medicamentos, o cualquier otra cosa ' ||
  E'que haya cambiado.\n\n' ||
  E'Voy a repasar tus datos y saltear lo que ya está confirmado.',
  'Saludo inicial del chat Estructurado (beta) cuando el viajero YA tiene datos cargados Y pasaron health.reminder_days días o más desde la última actualización. Usa {firstName} y {lastUpdated}. Los "\n\n" marcan pausas al leerlo en voz alta.'
)
ON CONFLICT (setting_key) DO NOTHING;
