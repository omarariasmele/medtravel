-- ============================================================
-- Pedido explícito del usuario: toda la parametrización del motor
-- Realtime del modo Clásico (voz en tiempo real) tiene que poder
-- ajustarse desde admin-web sin recompilar la app, igual que ya pasa
-- con la síntesis de voz del resto del asistente (assistant.tts_*,
-- ver proposed-app-settings.sql / proposed-openai-tts-voice-setting.sql).
-- Misma tabla genérica params.app_settings — la pantalla de
-- Parámetros de la app ya lista cualquier fila nueva sola, sin tocar
-- admin-web salvo el desplegable de voces (ver app-settings.page.tsx).
-- ============================================================

INSERT INTO params.app_settings (setting_key, setting_value, description_es) VALUES
  ('assistant.realtime_voice', 'marin', 'Voz del motor de voz en tiempo real (modo Clásico)'),
  ('assistant.realtime_model', 'gpt-realtime', 'Modelo de OpenAI Realtime usado por el modo Clásico'),
  -- Bug real reportado en vivo: con el default de OpenAI (500ms) el
  -- turno pasaba al siguiente tema apenas la persona hacía una pausa
  -- breve para pensar una fecha o un detalle.
  ('assistant.realtime_silence_duration_ms', '900', 'Milisegundos de silencio antes de considerar que el viajero terminó de hablar (default de OpenAI: 500)'),
  ('assistant.realtime_vad_threshold', '0.5', 'Sensibilidad del detector de voz (0 a 1 — más alto necesita hablar más fuerte, default de OpenAI: 0.5)'),
  ('assistant.realtime_prefix_padding_ms', '300', 'Milisegundos de audio previos que se incluyen al detectar que empezó a hablar (default de OpenAI: 300)')
ON CONFLICT (setting_key) DO NOTHING;
