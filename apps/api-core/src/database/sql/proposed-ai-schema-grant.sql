-- ============================================================
-- Fix: proposed-ai-module.sql otorgó GRANT SELECT/INSERT/UPDATE en
-- cada tabla de ai.* pero nunca USAGE en el esquema — sin esto
-- Postgres rechaza CUALQUIER acceso con "permiso denegado al esquema
-- ai" sin importar los grants de tabla (detectado probando en vivo el
-- endpoint /me/health-assistant/chat con AI_ENABLED=true).
-- ============================================================

GRANT USAGE ON SCHEMA ai TO app_runtime;
