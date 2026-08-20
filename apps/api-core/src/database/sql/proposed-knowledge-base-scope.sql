-- Gap #73 (ver SCHEMA_GAPS.md): el usuario pidió replicar el patrón de
-- "Base de conocimiento (IA)" (hasta ahora solo la leía el chat de
-- emergencia, ver gap #72) para el asistente de salud (carga de ficha
-- médica) y, apenas se probó en vivo, también para el asistente de
-- ayuda de uso de la app (`/me/assistant/ask`) — "hay conocimiento que
-- solo deberia aplicar ahi". Con 3 asistentes reales, una sola columna
-- scope_id (con un valor "BOTH" ambiguo entre cuáles dos) ya no alcanza
-- — se reemplaza por una tabla puente para que cada entrada pueda
-- aplicar a cualquier combinación de asistentes.

INSERT INTO params.domain_catalogs (code, name_es, name_en, allows_tenant_override)
VALUES ('KB_ENTRY_SCOPE', 'Alcance de entrada de base de conocimiento', 'Knowledge base entry scope', FALSE)
ON CONFLICT (code) DO NOTHING;

-- catalog_values no tiene UNIQUE(domain_id, code) — "ON CONFLICT DO
-- NOTHING" sin ese constraint NO deduplica (lo confirmamos en vivo: la
-- primera corrida de esta sección, reaplicada, insertó filas repetidas
-- para EMERGENCY_CHAT/HEALTH_ASSISTANT). WHERE NOT EXISTS es seguro
-- para volver a correr esto sin duplicar.
WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'KB_ENTRY_SCOPE')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM d, (VALUES
  ('EMERGENCY_CHAT',      'Chat de emergencia',                 'Emergency chat',       1),
  ('HEALTH_ASSISTANT',    'Asistente de salud (ficha médica)',  'Health assistant',     2),
  ('APP_HELP_ASSISTANT',  'Asistente de uso de la app',         'App help assistant',   3)
) AS v(code, es, en, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code
);

-- El valor "BOTH" de una iteración anterior de esta misma sesión (antes
-- de que existiera un tercer asistente) queda inactivo — nunca llegó a
-- usarse en ninguna entrada real.
UPDATE params.catalog_values
SET active = FALSE
WHERE code = 'BOTH'
  AND domain_id = (SELECT id FROM params.domain_catalogs WHERE code = 'KB_ENTRY_SCOPE');

CREATE TABLE IF NOT EXISTS ai.knowledge_base_entry_scopes (
  entry_id UUID NOT NULL REFERENCES ai.knowledge_base_entries(id) ON DELETE CASCADE,
  scope_id UUID NOT NULL REFERENCES params.catalog_values(id),
  PRIMARY KEY (entry_id, scope_id)
);

-- Backfill desde la columna scope_id de la iteración anterior (todas las
-- entradas reales hoy son EMERGENCY_CHAT, cargadas antes de este cambio).
INSERT INTO ai.knowledge_base_entry_scopes (entry_id, scope_id)
SELECT id, scope_id FROM ai.knowledge_base_entries WHERE scope_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE ai.knowledge_base_entries DROP COLUMN IF EXISTS scope_id;

GRANT SELECT, INSERT, UPDATE, DELETE ON ai.knowledge_base_entry_scopes TO app_runtime, test_runner;
