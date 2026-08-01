-- ============================================================
-- Catálogo de referencia de códigos de estándares de salud globales,
-- para que un operador pueda buscar/seleccionar un código real al
-- cargar una condición/alergia/medicamento en vez de escribir texto
-- libre sin codificar. NO se toca clinical.conditions/allergies/etc.
-- directamente — esas tablas son registros POR PACIENTE (requieren
-- person_id real), no catálogos de referencia; ya tienen sus propias
-- columnas opcionales (icd10_code, rxnorm_code, etc.) que se completan
-- fila a fila cuando se carga el dato de un paciente, buscando en este
-- catálogo.
--
-- Reutiliza la infraestructura existente de params.domain_catalogs /
-- params.catalog_values (misma que COUNTRY, OPERATOR_TYPE, etc.) en vez
-- de crear tablas nuevas — ya tiene RLS, ya tiene API
-- (/params/admin/catalog-values) y ya tiene pantalla de administración
-- (Catálogos / Parámetros) con alta y edición.
--
-- IMPORTANTE — alcance real de este set (no es el estándar completo):
-- Los códigos ICD-10-CM se verificaron contra la API pública de la NLM
-- (clinicaltables.nlm.nih.gov/api/icd10cm) y los RxNorm contra la API
-- pública del NIH (rxnav.nlm.nih.gov) en el momento de escribir este
-- archivo — no son adivinados de memoria. Es un set inicial de ~15-20
-- códigos por categoría, los más comunes para asistencia al viajero,
-- NO el estándar completo (ICD-10 tiene ~70.000 códigos, RxNorm decenas
-- de miles). CVX (vacunas) e ICD-10-PCS/SNOMED (procedimientos) quedan
-- pendientes: la fuente pública consultada para vacunas no respondió
-- con datos verificables en esta sesión, y no se quiso completar esas
-- dos categorías con códigos sin verificar en un sistema clínico.
-- ============================================================

INSERT INTO params.domain_catalogs (code, name_es, name_en, description_es, allows_tenant_override, allows_custom_values, is_ordered, is_system)
SELECT 'ICD10_CONDITION', 'Condiciones médicas (ICD-10-CM)', 'Medical conditions (ICD-10-CM)',
  'Catálogo de referencia de códigos ICD-10-CM para codificar condiciones médicas de un viajero. Set inicial (~18 códigos comunes), no el estándar completo.',
  FALSE, TRUE, FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs WHERE code = 'ICD10_CONDITION');

INSERT INTO params.domain_catalogs (code, name_es, name_en, description_es, allows_tenant_override, allows_custom_values, is_ordered, is_system)
SELECT 'RXNORM_MEDICATION', 'Medicamentos (RxNorm)', 'Medications (RxNorm)',
  'Catálogo de referencia de códigos RxNorm (NIH) para codificar medicamentos de un viajero. Set inicial (~17 códigos comunes), no el estándar completo.',
  FALSE, TRUE, FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs WHERE code = 'RXNORM_MEDICATION');

INSERT INTO params.domain_catalogs (code, name_es, name_en, description_es, allows_tenant_override, allows_custom_values, is_ordered, is_system)
SELECT 'RXNORM_ALLERGEN', 'Alérgenos medicamentosos (RxNorm)', 'Drug allergens (RxNorm)',
  'Catálogo de referencia de códigos RxNorm (NIH) para codificar alergias a medicamentos. Set inicial (~8 códigos comunes) — alergias alimentarias/ambientales quedan fuera de RxNorm por diseño (ver clinical.allergies.allergen_snomed para esos casos, aún sin poblar).',
  FALSE, TRUE, FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs WHERE code = 'RXNORM_ALLERGEN');

-- ── ICD10_CONDITION: 18 condiciones comunes, verificadas contra
-- clinicaltables.nlm.nih.gov/api/icd10cm ──
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, metadata)
SELECT d.id, v.code, v.label_es, v.label_en, v.ord, TRUE, jsonb_build_object('system', 'ICD-10-CM')
FROM params.domain_catalogs d,
  (VALUES
    ('E11.9',  'Diabetes tipo 2 sin complicaciones',            'Type 2 diabetes mellitus without complications', 1),
    ('I10',    'Hipertensión arterial esencial',                'Essential (primary) hypertension', 2),
    ('J45.909','Asma no especificada, sin complicaciones',       'Unspecified asthma, uncomplicated', 3),
    ('J44.9',  'Enfermedad pulmonar obstructiva crónica',        'Chronic obstructive pulmonary disease, unspecified', 4),
    ('K21.9',  'Reflujo gastroesofágico sin esofagitis',         'Gastro-esophageal reflux disease without esophagitis', 5),
    ('F41.1',  'Trastorno de ansiedad generalizada',             'Generalized anxiety disorder', 6),
    ('F32.9',  'Episodio depresivo, no especificado',            'Major depressive disorder, single episode, unspecified', 7),
    ('G43.909','Migraña no especificada',                        'Migraine, unspecified, not intractable, without status migrainosus', 8),
    ('I48.91', 'Fibrilación auricular no especificada',          'Unspecified atrial fibrillation', 9),
    ('N18.9',  'Enfermedad renal crónica, no especificada',      'Chronic kidney disease, unspecified', 10),
    ('E03.9',  'Hipotiroidismo, no especificado',                'Hypothyroidism, unspecified', 11),
    ('E05.90', 'Tirotoxicosis (hipertiroidismo), no especificada','Thyrotoxicosis, unspecified without thyrotoxic crisis or storm', 12),
    ('K80.20', 'Cálculo de vesícula biliar sin colecistitis',    'Calculus of gallbladder without cholecystitis without obstruction', 13),
    ('M17.9',  'Osteoartrosis de rodilla, no especificada',      'Osteoarthritis of knee, unspecified', 14),
    ('I25.9',  'Cardiopatía isquémica crónica, no especificada', 'Chronic ischemic heart disease, unspecified', 15),
    ('M54.50', 'Dolor lumbar, no especificado',                  'Low back pain, unspecified', 16),
    ('E78.5',  'Hiperlipidemia, no especificada',                'Hyperlipidemia, unspecified', 17),
    ('Z94.0',  'Estado post-trasplante renal',                   'Kidney transplant status', 18)
  ) AS v(code, label_es, label_en, ord)
WHERE d.code = 'ICD10_CONDITION'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv
    WHERE cv.domain_id = d.id AND cv.tenant_id IS NULL AND cv.code = v.code
  );

-- ── RXNORM_MEDICATION: 17 medicamentos comunes, RxCUI verificado
-- contra rxnav.nlm.nih.gov/REST/rxcui.json ──
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, metadata)
SELECT d.id, v.code, v.label_es, v.label_en, v.ord, TRUE, jsonb_build_object('system', 'RxNorm')
FROM params.domain_catalogs d,
  (VALUES
    ('161',    'Paracetamol (acetaminofén)', 'Acetaminophen', 1),
    ('5640',   'Ibuprofeno',                 'Ibuprofen', 2),
    ('83367',  'Atorvastatina',              'Atorvastatin', 3),
    ('7646',   'Omeprazol',                  'Omeprazole', 4),
    ('723',    'Amoxicilina',                'Amoxicillin', 5),
    ('52175',  'Losartán',                   'Losartan', 6),
    ('17767',  'Amlodipina',                 'Amlodipine', 7),
    ('6918',   'Metoprolol',                 'Metoprolol', 8),
    ('36567',  'Simvastatina',               'Simvastatin', 9),
    ('10582',  'Levotiroxina',               'Levothyroxine', 10),
    ('1191',   'Aspirina (ácido acetilsalicílico)', 'Aspirin', 11),
    ('11289',  'Warfarina',                  'Warfarin', 12),
    ('36437',  'Sertralina',                 'Sertraline', 13),
    ('435',    'Salbutamol (albuterol)',     'Albuterol', 14),
    ('274783', 'Insulina glargina',          'Insulin glargine', 15),
    ('18631',  'Azitromicina',               'Azithromycin', 16),
    ('6809',   'Metformina',                 'Metformin', 17)
  ) AS v(code, label_es, label_en, ord)
WHERE d.code = 'RXNORM_MEDICATION'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv
    WHERE cv.domain_id = d.id AND cv.tenant_id IS NULL AND cv.code = v.code
  );

-- ── RXNORM_ALLERGEN: 8 alérgenos medicamentosos comunes, RxCUI
-- verificado contra rxnav.nlm.nih.gov/REST/rxcui.json ──
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, metadata)
SELECT d.id, v.code, v.label_es, v.label_en, v.ord, TRUE, jsonb_build_object('system', 'RxNorm')
FROM params.domain_catalogs d,
  (VALUES
    ('7984',    'Penicilina V',            'Penicillin V', 1),
    ('10180',   'Sulfametoxazol',          'Sulfamethoxazole', 2),
    ('2670',    'Codeína',                 'Codeine', 3),
    ('7052',    'Morfina',                 'Morphine', 4),
    ('2231',    'Cefalexina',              'Cephalexin', 5),
    ('723',     'Amoxicilina',             'Amoxicillin', 6),
    ('1191',    'Aspirina / AINEs',        'Aspirin / NSAIDs', 7),
    ('1314891', 'Látex',                   'Latex', 8)
  ) AS v(code, label_es, label_en, ord)
WHERE d.code = 'RXNORM_ALLERGEN'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv
    WHERE cv.domain_id = d.id AND cv.tenant_id IS NULL AND cv.code = v.code
  );
