-- ============================================================
-- Pedido explícito del usuario: voz "totalmente natural, similar a
-- ChatGPT/Gemini" para el asistente de salud — se reemplaza el motor
-- de texto-a-voz del teléfono por la voz de OpenAI (gpt-4o-mini-tts,
-- que además acepta instrucciones de estilo en lenguaje natural, ver
-- OpenAIProvider.synthesizeSpeech) cuando está disponible, con el motor
-- del dispositivo como respaldo si falla. La voz elegida se guarda acá
-- (params.app_settings, ya existía la tabla — ver gap #68) para poder
-- cambiarla desde "Parámetros de la app" sin recompilar.
-- ============================================================

INSERT INTO params.app_settings (setting_key, setting_value, description_es) VALUES
  ('assistant.tts_voice', 'nova',
   'Voz de OpenAI para el asistente de salud (alloy, ash, ballad, coral, echo, fable, onyx, nova, sage, shimmer, verse, marin, cedar)')
ON CONFLICT (setting_key) DO NOTHING;
