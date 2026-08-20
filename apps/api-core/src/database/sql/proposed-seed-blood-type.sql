-- ============================================================
-- Gap #50: el dominio BLOOD_TYPE existía en params.domain_catalogs
-- pero sin ningún catalog_value sembrado (mismo patrón que gaps
-- #11/#12/#14/#26) — el selector "Grupo sanguíneo" (admin-web
-- VitalsTab y el nuevo de la app móvil, health_records_screen.dart)
-- se mostraba vacío, sin ninguna opción para elegir.
-- ============================================================

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.label_es, v.label_en, v.display_order, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
CROSS JOIN (VALUES
  ('O_NEG',  'O Negativo',  'O Negative',  1),
  ('O_POS',  'O Positivo',  'O Positive',  2),
  ('A_NEG',  'A Negativo',  'A Negative',  3),
  ('A_POS',  'A Positivo',  'A Positive',  4),
  ('B_NEG',  'B Negativo',  'B Negative',  5),
  ('B_POS',  'B Positivo',  'B Positive',  6),
  ('AB_NEG', 'AB Negativo', 'AB Negative', 7),
  ('AB_POS', 'AB Positivo', 'AB Positive', 8)
) AS v(code, label_es, label_en, display_order)
WHERE dc.code = 'BLOOD_TYPE'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = dc.id AND cv.code = v.code
  );
