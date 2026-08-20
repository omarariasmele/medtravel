-- Rediseño del Historial de Salud — pedido explícito del usuario a
-- partir de un documento de requisitos + mockups (ver plan de sesión):
-- clasificación crónica/no-crónica de condiciones (status_id ya tenía
-- el valor CHRONIC sembrado, nunca se usaba), tabla de Implantes y
-- Dispositivos (no existía), catálogo de indicadores de estudios por
-- tipo de análisis (antes solo columnas sueltas en lab_results), y
-- catálogos de referencia (Enfermedades/Implantes/Cirugías conocidas)
-- para el submenú "Tablas Sistema" de admin-web. Nunca se toca
-- baseline (000-009).

-- ============================================================
-- 1. Dominios de catálogo nuevos
-- ============================================================

INSERT INTO params.domain_catalogs (code, name_es, name_en, allows_tenant_override)
SELECT code, name_es, name_en, FALSE
FROM (VALUES
  ('CONDITION_CATALOG', 'Enfermedades conocidas', 'Known conditions'),
  ('IMPLANT_TYPE',       'Tipos de implantes/dispositivos', 'Implant/device types'),
  ('SURGERY_CATALOG',    'Cirugías conocidas', 'Known surgeries'),
  ('LAB_STUDY_TYPE',     'Tipo de estudio', 'Study type'),
  ('LAB_INDICATOR',      'Indicador de estudio', 'Study indicator')
) AS v(code, name_es, name_en)
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs d WHERE d.code = v.code);

-- LAB_STUDY_TYPE — mapea a las secciones del mockup (Análisis de
-- Sangre / Análisis de Orina / Estudios Radiológicos / Otros Estudios).
WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'LAB_STUDY_TYPE')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM d, (VALUES
  ('BLOOD',   'Análisis de sangre',      'Blood test',       1),
  ('URINE',   'Análisis de orina',       'Urine test',       2),
  ('IMAGING', 'Estudios radiológicos',   'Imaging studies',  3),
  ('OTHER',   'Otros estudios',          'Other studies',    4)
) AS v(code, es, en, ord)
WHERE NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code);

-- LAB_INDICATOR — un indicador por valor de catálogo. `metadata`
-- guarda {studyTypeCode, unit, isKeyIndicator} para que
-- catalogs-admin (con el editor de metadata que se agrega en el
-- backend de esta misma etapa) permita curarlos sin tocar código.
-- Se siembra con los que el mockup pidió explícitamente + los que ya
-- existían como columnas propias en clinical.lab_results (quedan
-- documentados acá también, aunque esos sigan usando su columna
-- dedicada en vez de custom_values).
WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'LAB_INDICATOR')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status, metadata)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE', v.meta
FROM d, (VALUES
  ('RED_BLOOD_CELLS',  'Recuento de glóbulos rojos', 'Red blood cell count', 1, '{"studyTypeCode":"BLOOD","unit":"/mm3","isKeyIndicator":true}'::jsonb),
  ('HEMOGLOBIN',       'Hemoglobina',                'Hemoglobin',            2, '{"studyTypeCode":"BLOOD","unit":"g/dL","isKeyIndicator":true}'::jsonb),
  ('HEMATOCRIT',       'Hematocrito',                'Hematocrit',            3, '{"studyTypeCode":"BLOOD","unit":"%","isKeyIndicator":true}'::jsonb),
  ('WHITE_BLOOD_CELLS','Recuento de glóbulos blancos','White blood cell count',4, '{"studyTypeCode":"BLOOD","unit":"/mm3","isKeyIndicator":true}'::jsonb),
  ('GLUCOSE_FASTING',  'Glucemia',                   'Fasting glucose',       5, '{"studyTypeCode":"BLOOD","unit":"mg/dL","isKeyIndicator":true}'::jsonb),
  ('UREA',             'Uremia',                     'Urea',                  6, '{"studyTypeCode":"BLOOD","unit":"mg/dL","isKeyIndicator":true}'::jsonb),
  ('URINE_DENSITY',    'Densidad',                   'Urine density',         7, '{"studyTypeCode":"URINE","unit":"","isKeyIndicator":true}'::jsonb),
  ('URINE_PH',         'pH',                         'Urine pH',              8, '{"studyTypeCode":"URINE","unit":"","isKeyIndicator":true}'::jsonb),
  ('IMAGING_FINDINGS',  'Hallazgos',                 'Findings',              9, '{"studyTypeCode":"IMAGING","unit":"","isKeyIndicator":true}'::jsonb)
) AS v(code, es, en, ord, meta)
WHERE NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code);

-- CONDITION_CATALOG — enfermedades conocidas + si son consideradas
-- crónicas por defecto (metadata {isChronic: bool}) — pedido explícito
-- del usuario: "Diabetes hay una sola que puede ser de distinto tipo,
-- no pueden existir dos diabetes". Referencia curable desde
-- "Tablas Sistema", no obliga a usar el catálogo todavía (el texto
-- libre sigue funcionando, ver ai.service.ts/openai.provider.ts).
WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'CONDITION_CATALOG')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status, metadata)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE', v.meta
FROM d, (VALUES
  ('DIABETES',              'Diabetes',                  'Diabetes',                1, '{"isChronic":true}'::jsonb),
  ('HYPERTENSION',          'Hipertensión arterial',     'Hypertension',            2, '{"isChronic":true}'::jsonb),
  ('ASTHMA',                'Asma',                      'Asthma',                  3, '{"isChronic":true}'::jsonb),
  ('HEPATITIS',             'Hepatitis',                 'Hepatitis',               4, '{"isChronic":false}'::jsonb),
  ('PNEUMONIA',             'Neumonía',                  'Pneumonia',               5, '{"isChronic":false}'::jsonb)
) AS v(code, es, en, ord, meta)
WHERE NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code);

-- IMPLANT_TYPE — tipos de implante/dispositivo más comunes.
WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'IMPLANT_TYPE')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT d.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM d, (VALUES
  ('PACEMAKER',      'Marcapasos',                'Pacemaker',            1),
  ('DEFIBRILLATOR',  'Cardiodesfibrilador',       'Defibrillator',        2),
  ('HIP_PROSTHESIS', 'Prótesis de cadera',        'Hip prosthesis',       3),
  ('KNEE_PROSTHESIS','Prótesis de rodilla',       'Knee prosthesis',      4),
  ('INSULIN_PUMP',   'Bomba de insulina',         'Insulin pump',         5),
  ('OTHER',          'Otro',                      'Other',                6)
) AS v(code, es, en, ord)
WHERE NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code);

-- ============================================================
-- 2. clinical.implants_devices — recurso nuevo (no existía nada)
-- ============================================================

CREATE TABLE IF NOT EXISTS clinical.implants_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id UUID NOT NULL REFERENCES core.persons(id),
  member_id UUID REFERENCES core.members(id),
  device_name BYTEA NOT NULL,
  device_type_id UUID REFERENCES params.catalog_values(id),
  implanted_at DATE,
  notes BYTEA,
  canonical_status_id UUID NOT NULL REFERENCES params.catalog_values(id),
  confirmation_status_id UUID REFERENCES params.catalog_values(id),
  certification_status_id UUID REFERENCES params.catalog_values(id),
  member_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  member_confirmed_at TIMESTAMPTZ,
  member_challenged BOOLEAN NOT NULL DEFAULT FALSE,
  member_challenge_notes BYTEA,
  provenance_id UUID NOT NULL REFERENCES params.catalog_values(id),
  requires_member_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  deleted_at TIMESTAMPTZ,
  deletion_reason_id UUID REFERENCES params.catalog_values(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE clinical.implants_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical.implants_devices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinical_access ON clinical.implants_devices;
CREATE POLICY clinical_access ON clinical.implants_devices
  USING (clinical.has_clinical_access(person_id));

DROP POLICY IF EXISTS implants_insert ON clinical.implants_devices;
CREATE POLICY implants_insert ON clinical.implants_devices FOR INSERT TO app_runtime
  WITH CHECK (clinical.has_clinical_access(person_id));

DROP POLICY IF EXISTS implants_update ON clinical.implants_devices;
CREATE POLICY implants_update ON clinical.implants_devices FOR UPDATE TO app_runtime
  USING (clinical.has_clinical_access(person_id))
  WITH CHECK (clinical.has_clinical_access(person_id));

DROP POLICY IF EXISTS implants_no_delete ON clinical.implants_devices;
CREATE POLICY implants_no_delete ON clinical.implants_devices FOR DELETE TO app_runtime
  USING (FALSE);

CREATE TRIGGER trg_implants_devices_upd BEFORE UPDATE ON clinical.implants_devices
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

CREATE TRIGGER trg_implants_devices_immutable BEFORE UPDATE OF person_id, member_id ON clinical.implants_devices
  FOR EACH ROW EXECUTE FUNCTION clinical.deny_ownership_change();

CREATE TRIGGER audit_implants_devices AFTER INSERT OR DELETE OR UPDATE ON clinical.implants_devices
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();

GRANT SELECT, INSERT, UPDATE ON clinical.implants_devices TO app_runtime, test_runner;

-- ============================================================
-- 3. clinical.lab_results — study_type_id
-- ============================================================

ALTER TABLE clinical.lab_results
  ADD COLUMN IF NOT EXISTS study_type_id UUID REFERENCES params.catalog_values(id);

UPDATE clinical.lab_results
SET study_type_id = params.catalog_id('LAB_STUDY_TYPE', 'BLOOD')
WHERE study_type_id IS NULL;

ALTER TABLE clinical.lab_results
  ALTER COLUMN study_type_id SET NOT NULL,
  ALTER COLUMN study_type_id SET DEFAULT params.catalog_id('LAB_STUDY_TYPE', 'BLOOD');

-- ============================================================
-- 4. Chequeo de duplicados de condiciones — agrega subcadena
-- ============================================================
-- Pedido explícito: "diabetes" y "diabetes tipo 2" no pueden ser dos
-- filas — el match exacto no alcanza. Se agrega un chequeo de
-- subcadena (en cualquier dirección) como red de seguridad además
-- del match exacto que ya existía.

-- ============================================================
-- 5. ai.proposals — CHECK constraint necesita conocer IMPLANT_DEVICE
-- ============================================================
-- Mismo gap que ya pasó con LAB_RESULT esta sesión: el código puede
-- generar y validar el proposal perfectamente, pero el INSERT falla
-- igual si la base no conoce el tipo nuevo.

ALTER TABLE ai.proposals DROP CONSTRAINT IF EXISTS proposals_proposal_type_check;
ALTER TABLE ai.proposals ADD CONSTRAINT proposals_proposal_type_check
  CHECK (proposal_type::text = ANY (ARRAY[
    'MEDICATION', 'ALLERGY', 'CONDITION', 'SURGERY', 'VITALS', 'LAB_RESULT', 'IMPLANT_DEVICE'
  ]::text[]));

CREATE OR REPLACE FUNCTION clinical.prevent_duplicate_condition()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_new_name TEXT := lower(trim(core.decrypt_pii(NEW.condition_name)));
  v_existing_name TEXT;
BEGIN
  FOR v_existing_name IN
    SELECT lower(trim(core.decrypt_pii(c.condition_name)))
    FROM clinical.conditions c
    WHERE c.person_id = NEW.person_id
      AND c.active = TRUE
      AND c.deleted_at IS NULL
      AND c.id <> NEW.id
  LOOP
    IF v_existing_name = v_new_name
       OR v_existing_name LIKE v_new_name || '%'
       OR v_new_name LIKE v_existing_name || '%' THEN
      RAISE EXCEPTION 'Ya tenés cargada esa comorbilidad (%), agregá el detalle/tipo en vez de crear una nueva', v_existing_name
        USING ERRCODE = '23505';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
