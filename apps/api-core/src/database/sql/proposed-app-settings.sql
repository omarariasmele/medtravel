-- ============================================================
-- Gap: parámetros de comportamiento (ej. velocidad de voz del
-- asistente) estaban hardcodeados en la app móvil — cualquier ajuste
-- fino requería recompilar y volver a distribuir la app. Pedido
-- explícito del usuario: poder modificarlos desde la web sin tocar la
-- app. Tabla genérica clave/valor (no una tabla dedicada solo para voz)
-- para que sirva para cualquier parámetro futuro del mismo tipo, sin
-- necesitar una migración nueva cada vez.
--
-- Sin RLS propia — mismo criterio que params.domain_catalogs/
-- catalog_values (ver config-access.guard.ts): no son datos de un
-- tenant ni PII, son parámetros globales de la plataforma. La lectura
-- queda abierta a cualquier usuario autenticado (la app móvil los
-- necesita); la escritura la gatea el guard de la app (canManageConfig),
-- igual que el resto de "Catálogos / Parámetros".
-- ============================================================

CREATE TABLE IF NOT EXISTS params.app_settings (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key     TEXT         NOT NULL UNIQUE,
  setting_value   TEXT         NOT NULL,
  description_es  TEXT,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by      UUID         REFERENCES core.users(id)
);

GRANT SELECT, INSERT, UPDATE ON params.app_settings TO app_runtime, test_runner;

INSERT INTO params.app_settings (setting_key, setting_value, description_es) VALUES
  -- Bug real reportado en vivo: "habla muy despacio, ¿cómo hacemos
  -- para que hable más rápido?" — la causa real (confirmada con
  -- logcat) era que este valor nunca se mandaba como "speed" a la API
  -- de OpenAI (gpt-4o-mini-tts, el camino REAL de síntesis — ver
  -- AIService.getTtsSpeed/synthesizeSpeechStream); solo llegaba a
  -- afectar el motor nativo del teléfono, usado nada más si OpenAI
  -- falla. 1.0 = velocidad normal tanto para OpenAI (0.25-4.0) como
  -- para el motor nativo en Android — 1.3-1.5 se nota bien más rápido
  -- sin perder claridad, en los dos.
  ('assistant.tts_speech_rate', '1.35', 'Velocidad de lectura en voz alta del asistente de salud (Estructurado/Formulario). Controla la síntesis real de OpenAI (0.25 a 4.0, 1.0 = normal) y también el motor nativo del teléfono si OpenAI falla. Probado: 1.3-1.5 se nota bien más rápido sin perder claridad.'),
  ('assistant.tts_pitch', '1.0', 'Tono de la voz del asistente de salud (1.0 = normal)'),
  ('assistant.tts_pause_seconds', '3', 'Segundos de silencio antes de dar por terminado lo que dice el viajero (Android no baja de 1-3s aunque se ponga menos)'),
  ('assistant.tts_listen_seconds', '60', 'Segundos máximos de escucha continua por turno del viajero'),
  ('assistant.voice_reply_default_enabled', 'true', 'Si el asistente de salud lee sus respuestas en voz alta por defecto al entrar a la pantalla (true/false)')
ON CONFLICT (setting_key) DO NOTHING;
