-- ============================================================
-- Fase 1: marca y funciones dinámicas por empresa.
--
-- 1) core.member_branding_preferences — solo se usa cuando un viajero
--    tiene MÁS de un core.members vigente y elige manualmente cuál es
--    su "empresa activa" a los fines de marca/funciones (ver
--    resolveActiveTenant en me-member.helper.ts). La mayoría de los
--    viajeros nunca va a tener una fila acá.
--
-- 2) Catálogo inicial de feature_flags — pedido explícito del usuario:
--    "todas las funcionalidades de la app deben ser configurables si
--    aparecen o no", salvo 3 funciones base que siempre quedan activas
--    (ficha por formulario, compartir ficha sin IA, actualizar datos
--    de usuario — esas nunca pasan por flag, ver tenant_config
--    controller/mobile). Todos los flags acá quedan en default_value
--    = true y sin fila por tenant, para no cambiar el comportamiento
--    actual de ningún tenant existente hasta que un admin decida
--    restringir alguno puntualmente (insertando una fila con
--    tenant_id específico, vía el CRUD genérico de params/admin).
-- ============================================================

CREATE TABLE IF NOT EXISTS core.member_branding_preferences (
  person_id         UUID PRIMARY KEY REFERENCES core.persons(id),
  active_member_id  UUID NOT NULL REFERENCES core.members(id),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE core.member_branding_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.member_branding_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS member_branding_pref_self ON core.member_branding_preferences;
CREATE POLICY member_branding_pref_self ON core.member_branding_preferences
  FOR ALL
  USING (person_id = app.current_uuid('app.current_person_id'))
  WITH CHECK (person_id = app.current_uuid('app.current_person_id'));

GRANT SELECT, INSERT, UPDATE ON core.member_branding_preferences TO app_runtime;

INSERT INTO params.feature_flags
  (tenant_id, flag_key, flag_type, default_value, description_es, lifecycle_status)
SELECT NULL, v.flag_key, 'BOOLEAN', 'true'::jsonb, v.description_es, 'ACTIVE'
FROM (VALUES
  ('nav.coverage_enabled',            'Muestra la pestaña Cobertura'),
  ('nav.trips_enabled',               'Muestra la pestaña Viajes'),
  ('nav.emergency_enabled',           'Muestra la pestaña Emergencia/SOS'),
  ('ai.assistant_enabled',            'Habilita el asistente de IA (voz/chat)'),
  ('ai.destination_search_enabled',   'Habilita la búsqueda de info de destino con IA en Viajes'),
  -- Pedido explícito del usuario: de las 3 formas de cargar la Ficha
  -- de Salud, Formulario queda siempre activa (no pasa por flag,
  -- mismo criterio que compartir sin IA/actualizar perfil) — Clásico y
  -- Estructurado (los dos modos de chat con IA) sí son configurables.
  ('health.classic_mode_enabled',     'Habilita el modo Clásico (charla libre) para cargar la Ficha de Salud'),
  ('health.structured_mode_enabled',  'Habilita el modo Estructurado (pregunta por pregunta) para cargar la Ficha de Salud')
) AS v(flag_key, description_es)
WHERE NOT EXISTS (
  SELECT 1 FROM params.feature_flags ff
  WHERE ff.tenant_id IS NULL AND ff.flag_key = v.flag_key
);
