-- ============================================================
-- Pedido explícito del usuario: poder editar el saludo inicial del
-- chat Estructurado desde admin-web, sin tocar/recompilar la
-- app — mismo mecanismo ya usado para voz/pausa del asistente
-- (params.app_settings, ver AppSettingsPage). Se separan DOS
-- variantes (primera vez / ya tiene datos) porque structuredIntakeChat
-- ya arma un saludo distinto según health_record_last_updated_at.
-- {firstName} y {lastUpdated} se reemplazan en tiempo de ejecución;
-- los saltos de línea dobles (\n\n) marcan las pausas que el cliente
-- móvil respeta al leer en voz alta (ver _speakFirstTurn en
-- health_assistant_screen.dart).
-- ============================================================

INSERT INTO params.app_settings (setting_key, setting_value, description_es)
VALUES
  (
    'assistant.structured_greeting_new',
    E'Hola {firstName}, soy su asistente virtual para confeccionar su historia clínica de salud.\n\n' ||
    E'Estos datos son total y absolutamente confidenciales y solo podrán ser utilizados por usted en caso ' ||
    E'de requerir atención médica durante su viaje, y con el objetivo de facilitar el acceso a una correcta atención.\n\n' ||
    E'Comenzaremos a registrar sus datos de salud.',
    'Saludo inicial del chat Estructurado cuando el viajero NO tiene datos cargados todavía. Usa {firstName}. Los "\n\n" marcan pausas al leerlo en voz alta.'
  ),
  (
    'assistant.structured_greeting_update',
    E'Hola {firstName}, soy su asistente virtual de Historial de Salud.\n\n' ||
    E'Ya tenés datos cargados — la última actualización fue el {lastUpdated}. Esto va a funcionar como una ' ||
    E'actualización: voy a saltear lo que ya está confirmado y solo preguntarte por lo que falta o cambió.\n\n' ||
    E'Comenzaremos a repasar sus datos de salud.',
    'Saludo inicial del chat Estructurado cuando el viajero YA tiene datos cargados. Usa {firstName} y {lastUpdated}. Los "\n\n" marcan pausas al leerlo en voz alta.'
  )
ON CONFLICT (setting_key) DO NOTHING;
