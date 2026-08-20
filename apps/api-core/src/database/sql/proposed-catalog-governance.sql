-- Fase 2 del rediseño de Historial de Salud — pedido explícito del
-- usuario: alergias, medicamentos, implantes, enfermedades y cirugías
-- deben poder seleccionarse de una tabla maestra (mismo patrón ya
-- armado para LAB_STUDY_TYPE/LAB_INDICATOR); si el valor no existe se
-- crea uno nuevo marcado DRAFT para que un operador lo revise/corrija/
-- fusione después. También: flag isAlertWorthy en CONDITION_CATALOG
-- para las Alertas médicas. Nunca se toca baseline (000-009).

-- ============================================================
-- 1. Dominios de catálogo nuevos
-- ============================================================

INSERT INTO params.domain_catalogs (code, name_es, name_en, allows_tenant_override)
SELECT code, name_es, name_en, FALSE
FROM (VALUES
  ('ALLERGEN',   'Alérgenos', 'Allergens'),
  ('MEDICATION', 'Medicamentos', 'Medications')
) AS v(code, name_es, name_en)
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs d WHERE d.code = v.code);

-- ============================================================
-- 2. Semillas iniciales
-- ============================================================

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, lifecycle_status)
SELECT (SELECT id FROM params.domain_catalogs WHERE code = 'ALLERGEN'), code, label_es, label_en, display_order, 'ACTIVE'
FROM (VALUES
  ('PENICILLIN', 'Penicilina', 'Penicillin', 1),
  ('NSAIDS', 'Aspirina/AINEs', 'Aspirin/NSAIDs', 2),
  ('SHELLFISH', 'Mariscos', 'Shellfish', 3),
  ('PEANUTS_NUTS', 'Maní/frutos secos', 'Peanuts/tree nuts', 4),
  ('LATEX', 'Látex', 'Latex', 5),
  ('POLLEN', 'Polen', 'Pollen', 6),
  ('INSECT_STING', 'Picadura de insecto', 'Insect sting', 7),
  ('SULFA_DRUGS', 'Sulfamidas', 'Sulfa drugs', 8),
  ('IODINE_CONTRAST', 'Yodo/contraste', 'Iodine/contrast dye', 9)
) AS v(code, label_es, label_en, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv
  JOIN params.domain_catalogs d ON d.id = cv.domain_id
  WHERE d.code = 'ALLERGEN' AND cv.code = v.code
);

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, lifecycle_status)
SELECT (SELECT id FROM params.domain_catalogs WHERE code = 'MEDICATION'), code, label_es, label_en, display_order, 'ACTIVE'
FROM (VALUES
  ('PARACETAMOL', 'Paracetamol', 'Acetaminophen', 1),
  ('IBUPROFEN', 'Ibuprofeno', 'Ibuprofen', 2),
  ('AMOXICILLIN', 'Amoxicilina', 'Amoxicillin', 3),
  ('METFORMIN', 'Metformina', 'Metformin', 4),
  ('LOSARTAN', 'Losartán', 'Losartan', 5),
  ('ATORVASTATIN', 'Atorvastatina', 'Atorvastatin', 6),
  ('INSULIN', 'Insulina', 'Insulin', 7),
  ('ASPIRIN', 'Aspirina', 'Aspirin', 8),
  ('OMEPRAZOLE', 'Omeprazol', 'Omeprazole', 9),
  ('LEVOTHYROXINE', 'Levotiroxina', 'Levothyroxine', 10)
) AS v(code, label_es, label_en, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv
  JOIN params.domain_catalogs d ON d.id = cv.domain_id
  WHERE d.code = 'MEDICATION' AND cv.code = v.code
);

-- SURGERY_CATALOG existe desde la Fase 1 pero nunca se sembró.
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, lifecycle_status)
SELECT (SELECT id FROM params.domain_catalogs WHERE code = 'SURGERY_CATALOG'), code, label_es, label_en, display_order, 'ACTIVE'
FROM (VALUES
  ('APPENDECTOMY', 'Apendicectomía', 'Appendectomy', 1),
  ('CHOLECYSTECTOMY', 'Colecistectomía', 'Cholecystectomy', 2),
  ('C_SECTION', 'Cesárea', 'C-section', 3),
  ('TONSILLECTOMY', 'Amigdalectomía', 'Tonsillectomy', 4),
  ('HERNIA_REPAIR', 'Hernioplastia', 'Hernia repair', 5),
  ('ARTHROSCOPY', 'Artroscopía', 'Arthroscopy', 6),
  ('GASTRIC_BYPASS', 'Bypass gástrico', 'Gastric bypass', 7)
) AS v(code, label_es, label_en, display_order)
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv
  JOIN params.domain_catalogs d ON d.id = cv.domain_id
  WHERE d.code = 'SURGERY_CATALOG' AND cv.code = v.code
);

-- isAlertWorthy: para las Alertas médicas — destaca (no filtra) las
-- comorbilidades que ameritan más atención en una urgencia.
UPDATE params.catalog_values cv
SET metadata = cv.metadata || jsonb_build_object('isAlertWorthy', v.is_alert)
FROM (VALUES
  ('DIABETES', TRUE),
  ('HYPERTENSION', TRUE),
  ('ASTHMA', TRUE),
  ('HEPATITIS', TRUE),
  ('PNEUMONIA', FALSE)
) AS v(code, is_alert)
JOIN params.domain_catalogs d ON d.code = 'CONDITION_CATALOG'
WHERE cv.domain_id = d.id AND cv.code = v.code;

-- ============================================================
-- 3. Columnas de FK a catálogo (nullable, no rompen filas existentes)
-- ============================================================

ALTER TABLE clinical.allergies ADD COLUMN IF NOT EXISTS allergen_catalog_id UUID REFERENCES params.catalog_values(id);
ALTER TABLE clinical.medications ADD COLUMN IF NOT EXISTS medication_catalog_id UUID REFERENCES params.catalog_values(id);
ALTER TABLE clinical.conditions ADD COLUMN IF NOT EXISTS condition_catalog_id UUID REFERENCES params.catalog_values(id);
ALTER TABLE clinical.surgeries ADD COLUMN IF NOT EXISTS procedure_catalog_id UUID REFERENCES params.catalog_values(id);
-- clinical.implants_devices.device_type_id ya cumple este rol (FK a IMPLANT_TYPE) — no se agrega columna.
