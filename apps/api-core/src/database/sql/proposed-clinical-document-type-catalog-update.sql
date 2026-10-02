-- ============================================================
-- Pedido explícito del usuario (probando la carga real de estudios):
-- "agregar Resonancia, cambiar Análisis de Sangre o de Orina por
-- Laboratorio, agregar Tomografía". BLOOD_TEST/URINE_TEST/
-- OTHER_LAB_TEST se DESACTIVAN (nunca se borran — mismo criterio de
-- todo el sistema) en vez de eliminarse: si algún documento ya subido
-- durante las pruebas de hoy quedó con uno de esos códigos, la fila
-- de catalog_values sigue existiendo para que ese documento no quede
-- con una referencia rota, solo deja de ofrecerse para subidas nuevas.
-- ============================================================

-- catalog_values no tiene UNIQUE(domain_id, code) — WHERE NOT EXISTS
-- en vez de ON CONFLICT (ver proposed-clinical-document-catalog-values.sql).
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, label_pt, label_fr, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.es, v.en, v.pt, v.fr, v.ord, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
JOIN (VALUES
  ('CLINICAL_DOCUMENT_TYPE', 'LABORATORY', 'Laboratorio', 'Laboratory', 'Laboratório', 'Laboratoire', 1),
  ('CLINICAL_DOCUMENT_TYPE', 'XRAY',       'Radiografía', 'X-ray',      'Radiografia', 'Radiographie', 2),
  ('CLINICAL_DOCUMENT_TYPE', 'CT_SCAN',    'Tomografía',  'CT scan',    'Tomografia',  'Tomodensitométrie (scanner)', 3),
  ('CLINICAL_DOCUMENT_TYPE', 'MRI',        'Resonancia',  'MRI',        'Ressonância', 'IRM', 4),
  ('CLINICAL_DOCUMENT_TYPE', 'GENERAL_STUDY', 'Estudio general', 'General study', 'Estudo geral', 'Examen général', 5),
  ('CLINICAL_DOCUMENT_TYPE', 'OTHER',      'Otro documento', 'Other document', 'Outro documento', 'Autre document', 6)
) AS v(domain_code, code, es, en, pt, fr, ord) ON dc.code = v.domain_code
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = dc.id AND cv.code = v.code
);

-- Reordena XRAY (venía con display_order 4, ahora 2) y desactiva los
-- 3 tipos reemplazados por LABORATORY.
UPDATE params.catalog_values cv
SET display_order = v.ord
FROM params.domain_catalogs dc
JOIN (VALUES ('XRAY', 2), ('GENERAL_STUDY', 5), ('OTHER', 6)) AS v(code, ord)
  ON dc.code = 'CLINICAL_DOCUMENT_TYPE'
WHERE cv.domain_id = dc.id AND cv.code = v.code;

UPDATE params.catalog_values cv
SET active = FALSE
FROM params.domain_catalogs dc
WHERE cv.domain_id = dc.id AND dc.code = 'CLINICAL_DOCUMENT_TYPE'
  AND cv.code IN ('BLOOD_TEST', 'URINE_TEST', 'OTHER_LAB_TEST');
