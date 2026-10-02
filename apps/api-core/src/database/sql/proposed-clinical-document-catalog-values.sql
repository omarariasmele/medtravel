-- ============================================================
-- Pedido explícito del usuario: subida de estudios/análisis/
-- radiografías desde la app (PDF/JPG/PNG). clinical.documents,
-- clinical.document_ai_processing y clinical.document_shares ya
-- existen completos en el baseline (005_clinical.sql) desde hace
-- rato, pero sus 3 dominios de catálogo (CLINICAL_DOCUMENT_TYPE,
-- ACCESS_LEVEL, DOCUMENT_STATUS) estaban declarados sin ningún
-- catalog_value sembrado — document_type_id/access_level_id/status_id
-- son NOT NULL, así que ningún INSERT en clinical.documents podía
-- funcionar hasta sembrar esto (mismo patrón que gap #11/#12/#14/#26).
-- ============================================================

-- catalog_values no tiene UNIQUE(domain_id, code) — "ON CONFLICT DO
-- NOTHING" sin ese constraint NO deduplica (ver gap #73/proposed-
-- knowledge-base-scope.sql, confirmado en vivo con filas duplicadas
-- reales). WHERE NOT EXISTS es seguro para volver a correr esto.
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, label_pt, label_fr, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.es, v.en, v.pt, v.fr, v.ord, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
JOIN (VALUES
  ('CLINICAL_DOCUMENT_TYPE', 'BLOOD_TEST',     'Análisis de sangre', 'Blood test',      'Exame de sangue',  'Analyse de sang',     1),
  ('CLINICAL_DOCUMENT_TYPE', 'URINE_TEST',     'Análisis de orina',  'Urine test',      'Exame de urina',   'Analyse d''urine',    2),
  ('CLINICAL_DOCUMENT_TYPE', 'OTHER_LAB_TEST', 'Otro análisis',      'Other lab test',  'Outro exame',      'Autre analyse',       3),
  ('CLINICAL_DOCUMENT_TYPE', 'XRAY',           'Radiografía',        'X-ray',           'Radiografia',      'Radiographie',        4),
  ('CLINICAL_DOCUMENT_TYPE', 'GENERAL_STUDY',  'Estudio general',    'General study',   'Estudo geral',     'Examen général',      5),
  ('CLINICAL_DOCUMENT_TYPE', 'OTHER',          'Otro documento',     'Other document',  'Outro documento',  'Autre document',      6),

  ('ACCESS_LEVEL', 'STANDARD', 'Estándar', 'Standard', 'Padrão', 'Standard', 1),

  ('DOCUMENT_STATUS', 'ACTIVE',   'Activo',    'Active',   'Ativo',     'Actif',    1),
  ('DOCUMENT_STATUS', 'ARCHIVED', 'Archivado', 'Archived', 'Arquivado', 'Archivé',  2)
) AS v(domain_code, code, es, en, pt, fr, ord) ON dc.code = v.domain_code
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = dc.id AND cv.code = v.code
);
