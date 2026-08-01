-- ============================================================
-- Catálogos para la carga/validación de pólizas (core.partner_member_records
-- + core.identity_match_candidates/decisions) — los dominios ya existían
-- referenciados por columnas FK, pero sin valores sembrados (o, en el
-- caso de MATCH_CANDIDATE_STATUS, sin el dominio siquiera creado).
-- ============================================================

INSERT INTO params.domain_catalogs (code, name_es, name_en, description_es, allows_tenant_override, allows_custom_values, is_ordered, is_system, active)
SELECT 'MATCH_CANDIDATE_STATUS', 'Estado de candidato de matching', 'Match candidate status',
       'Estado de un candidato de coincidencia entre póliza cargada y persona registrada', FALSE, FALSE, FALSE, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs WHERE code = 'MATCH_CANDIDATE_STATUS');

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, active)
SELECT d.id, v.code, v.label_es, v.label_en, v.display_order, TRUE, TRUE
FROM params.domain_catalogs d
CROSS JOIN (VALUES
  ('PENDING', 'Pendiente de póliza', 'Pending', 1),
  ('MATCHED', 'Emparejado con póliza', 'Matched', 2),
  ('NO_MATCH', 'Sin coincidencia', 'No match', 3),
  ('ERROR', 'Error al procesar', 'Error', 4)
) AS v(code, label_es, label_en, display_order)
WHERE d.code = 'IMPORT_STATUS'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code);

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, active)
SELECT d.id, v.code, v.label_es, v.label_en, v.display_order, TRUE, TRUE
FROM params.domain_catalogs d
CROSS JOIN (VALUES
  ('EXACT_DOC_NUMBER', 'Coincidencia exacta por documento', 'Exact document match', 1),
  ('FUZZY_NAME', 'Coincidencia aproximada por nombre', 'Fuzzy name match', 2)
) AS v(code, label_es, label_en, display_order)
WHERE d.code = 'MATCH_TYPE'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code);

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, active)
SELECT d.id, v.code, v.label_es, v.label_en, v.display_order, TRUE, TRUE
FROM params.domain_catalogs d
CROSS JOIN (VALUES
  ('PENDING', 'Pendiente de revisión', 'Pending review', 1),
  ('APPROVED', 'Aprobado', 'Approved', 2),
  ('REJECTED', 'Rechazado', 'Rejected', 3)
) AS v(code, label_es, label_en, display_order)
WHERE d.code = 'MATCH_CANDIDATE_STATUS'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code);

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, active)
SELECT d.id, v.code, v.label_es, v.label_en, v.display_order, TRUE, TRUE
FROM params.domain_catalogs d
CROSS JOIN (VALUES
  ('APPROVED', 'Aprobado', 'Approved', 1),
  ('REJECTED', 'Rechazado', 'Rejected', 2)
) AS v(code, label_es, label_en, display_order)
WHERE d.code = 'MATCH_DECISION'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code);

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, active)
SELECT d.id, v.code, v.label_es, v.label_en, v.display_order, TRUE, TRUE
FROM params.domain_catalogs d
CROSS JOIN (VALUES
  ('PARTNER_UPLOAD', 'Cargado por la empresa de asistencia', 'Uploaded by assistance company', 1),
  ('MEMBER_DECLARED', 'Autodeclarado por el viajero', 'Self-declared by traveler', 2)
) AS v(code, label_es, label_en, display_order)
WHERE d.code = 'VERIFICATION_SOURCE'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code);
