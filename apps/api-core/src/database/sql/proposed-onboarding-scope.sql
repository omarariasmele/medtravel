-- Pedido explícito del usuario (Fase 1 del rediseño de Historial de
-- Salud, plan sección 8): mensaje de bienvenida general al primer uso
-- de la app, editable desde la Base de conocimiento (IA) existente en
-- vez de hardcodeado — mismo mecanismo de gap #73
-- (proposed-knowledge-base-scope.sql), un scope nuevo más.

WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'KB_ENTRY_SCOPE')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT d.id, 'ONBOARDING', 'Bienvenida general (primer uso)', 'General onboarding (first use)', 4, TRUE, 'ACTIVE'
FROM d
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = 'ONBOARDING'
);
