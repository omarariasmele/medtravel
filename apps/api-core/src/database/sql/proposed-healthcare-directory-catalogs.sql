-- ============================================================
-- Gap #12 (SCHEMA_GAPS.md): ORGANIZATION_TYPE y MEDICAL_SPECIALTY no
-- existen como domain_catalogs (clinical.healthcare_organizations /
-- clinical.healthcare_professionals no pueden crearse sin esto).
-- DOCUMENT_TYPE ya existe pero sin valores (mismo caso que gap #11).
-- Valores propuestos por el equipo técnico, a revisar como decisión
-- de producto — no son un cierre de diseño definitivo.
-- ============================================================

INSERT INTO params.domain_catalogs (code, name_es, name_en, allows_tenant_override, is_ordered)
VALUES
  ('ORGANIZATION_TYPE', 'Tipo de organización médica', 'Healthcare organization type', FALSE, FALSE),
  ('MEDICAL_SPECIALTY', 'Especialidad médica',         'Medical specialty',            FALSE, FALSE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
JOIN (VALUES
  ('ORGANIZATION_TYPE', 'HOSPITAL',        'Hospital',                'Hospital',                1),
  ('ORGANIZATION_TYPE', 'CLINIC',          'Clínica',                 'Clinic',                  2),
  ('ORGANIZATION_TYPE', 'PRIVATE_PRACTICE','Consultorio particular',  'Private practice',        3),
  ('ORGANIZATION_TYPE', 'DIAGNOSTIC_CENTER','Centro de diagnóstico',  'Diagnostic center',       4),
  ('ORGANIZATION_TYPE', 'PHARMACY',        'Farmacia',                'Pharmacy',                5),
  ('ORGANIZATION_TYPE', 'AMBULANCE',       'Servicio de ambulancia',  'Ambulance service',       6),
  ('ORGANIZATION_TYPE', 'OTHER',           'Otro',                    'Other',                   7),

  ('MEDICAL_SPECIALTY', 'GENERAL_MEDICINE', 'Medicina general',       'General medicine',        1),
  ('MEDICAL_SPECIALTY', 'EMERGENCY_MEDICINE','Medicina de urgencias', 'Emergency medicine',       2),
  ('MEDICAL_SPECIALTY', 'INTERNAL_MEDICINE', 'Clínica médica',        'Internal medicine',        3),
  ('MEDICAL_SPECIALTY', 'CARDIOLOGY',       'Cardiología',            'Cardiology',               4),
  ('MEDICAL_SPECIALTY', 'TRAUMATOLOGY',     'Traumatología',          'Traumatology',             5),
  ('MEDICAL_SPECIALTY', 'PEDIATRICS',       'Pediatría',              'Pediatrics',               6),
  ('MEDICAL_SPECIALTY', 'GYNECOLOGY',       'Ginecología',            'Gynecology',               7),
  ('MEDICAL_SPECIALTY', 'PSYCHIATRY',       'Psiquiatría',            'Psychiatry',               8),
  ('MEDICAL_SPECIALTY', 'DENTISTRY',        'Odontología',            'Dentistry',                9),
  ('MEDICAL_SPECIALTY', 'OTHER',            'Otra',                   'Other',                   10),

  ('DOCUMENT_TYPE', 'PASSPORT',        'Pasaporte',                  'Passport',                 1),
  ('DOCUMENT_TYPE', 'NATIONAL_ID',     'Documento nacional (DNI)',   'National ID',              2),
  ('DOCUMENT_TYPE', 'DRIVER_LICENSE',  'Licencia de conducir',       'Driver license',           3),
  ('DOCUMENT_TYPE', 'OTHER',           'Otro',                       'Other',                    4),

  ('ORG_VERIFICATION_STATUS', 'UNVERIFIED', 'Sin verificar',         'Unverified',               1),
  ('ORG_VERIFICATION_STATUS', 'PENDING',    'Verificación pendiente','Verification pending',     2),
  ('ORG_VERIFICATION_STATUS', 'VERIFIED',   'Verificada',            'Verified',                 3),
  ('ORG_VERIFICATION_STATUS', 'REJECTED',   'Rechazada',             'Rejected',                 4),

  -- Encontrado al armar la sección "Historia clínica" del call center
  -- (clinical.conditions.status_id NOT NULL, mismo caso que arriba).
  ('CONDITION_STATUS', 'ACTIVE',       'Activa',       'Active',       1),
  ('CONDITION_STATUS', 'RESOLVED',     'Resuelta',     'Resolved',     2),
  ('CONDITION_STATUS', 'CHRONIC',      'Crónica',      'Chronic',      3),
  ('CONDITION_STATUS', 'IN_REMISSION', 'En remisión',  'In remission', 4)
) AS v(domain_code, code, es, en, ord) ON dc.code = v.domain_code
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv
  WHERE cv.domain_id = dc.id AND cv.code = v.code
);
