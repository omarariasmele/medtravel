-- ============================================================
-- Gap encontrado construyendo la historia clínica completa (sexo,
-- edad, antecedentes quirúrgicos, dosis/frecuencia de medicamentos,
-- etc.): varios dominios que ya referencian clinical.conditions/
-- medications/surgeries existen en params.domain_catalogs pero están
-- vacíos (DOSE_UNIT, SURGICAL_APPROACH, SURGERY_OUTCOME, TRAVEL_RISK),
-- y dos ni siquiera existen todavía (MEDICATION_FREQUENCY,
-- MEDICATION_ROUTE) — sin esto, los selects del formulario quedarían
-- vacíos e inutilizables. Set inicial chico y de sentido común, no un
-- catálogo médico exhaustivo — se puede ampliar después vía Catálogos.
-- ============================================================

INSERT INTO params.domain_catalogs (code, name_es, name_en, allows_tenant_override, allows_custom_values, is_ordered, is_system)
SELECT 'MEDICATION_FREQUENCY', 'Frecuencia de medicación', 'Medication frequency', FALSE, TRUE, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs WHERE code = 'MEDICATION_FREQUENCY');

INSERT INTO params.domain_catalogs (code, name_es, name_en, allows_tenant_override, allows_custom_values, is_ordered, is_system)
SELECT 'MEDICATION_ROUTE', 'Vía de administración de medicación', 'Medication route', FALSE, TRUE, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs WHERE code = 'MEDICATION_ROUTE');

-- DOSE_UNIT
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system)
SELECT d.id, v.code, v.label_es, v.label_en, v.ord, TRUE
FROM params.domain_catalogs d,
  (VALUES ('MG','mg','mg',1), ('ML','ml','ml',2), ('MCG','mcg','mcg',3),
          ('UI','UI','IU',4), ('GOTAS','gotas','drops',5),
          ('COMPRIMIDOS','comprimidos','tablets',6), ('PARCHE','parche','patch',7)
  ) AS v(code, label_es, label_en, ord)
WHERE d.code = 'DOSE_UNIT'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.tenant_id IS NULL AND cv.code = v.code);

-- MEDICATION_FREQUENCY
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system)
SELECT d.id, v.code, v.label_es, v.label_en, v.ord, TRUE
FROM params.domain_catalogs d,
  (VALUES ('ONCE_DAILY','Una vez al día','Once daily',1),
          ('TWICE_DAILY','Cada 12 horas','Every 12 hours',2),
          ('THREE_DAILY','Cada 8 horas','Every 8 hours',3),
          ('FOUR_DAILY','Cada 6 horas','Every 6 hours',4),
          ('WEEKLY','Semanal','Weekly',5),
          ('AS_NEEDED','Según necesidad (SOS)','As needed (PRN)',6)
  ) AS v(code, label_es, label_en, ord)
WHERE d.code = 'MEDICATION_FREQUENCY'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.tenant_id IS NULL AND cv.code = v.code);

-- MEDICATION_ROUTE
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system)
SELECT d.id, v.code, v.label_es, v.label_en, v.ord, TRUE
FROM params.domain_catalogs d,
  (VALUES ('ORAL','Oral','Oral',1), ('IV','Intravenosa','Intravenous',2),
          ('IM','Intramuscular','Intramuscular',3), ('SC','Subcutánea','Subcutaneous',4),
          ('TOPICAL','Tópica','Topical',5), ('INHALED','Inhalatoria','Inhaled',6),
          ('OPHTHALMIC','Oftálmica','Ophthalmic',7), ('RECTAL','Rectal','Rectal',8)
  ) AS v(code, label_es, label_en, ord)
WHERE d.code = 'MEDICATION_ROUTE'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.tenant_id IS NULL AND cv.code = v.code);

-- TRAVEL_RISK
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system)
SELECT d.id, v.code, v.label_es, v.label_en, v.ord, TRUE
FROM params.domain_catalogs d,
  (VALUES ('LOW','Bajo','Low',1), ('MODERATE','Moderado','Moderate',2),
          ('HIGH','Alto','High',3), ('CONTRAINDICATED','Contraindica viajar','Travel contraindicated',4)
  ) AS v(code, label_es, label_en, ord)
WHERE d.code = 'TRAVEL_RISK'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.tenant_id IS NULL AND cv.code = v.code);

-- SURGICAL_APPROACH
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system)
SELECT d.id, v.code, v.label_es, v.label_en, v.ord, TRUE
FROM params.domain_catalogs d,
  (VALUES ('OPEN','Abierta','Open',1), ('LAPAROSCOPIC','Laparoscópica','Laparoscopic',2),
          ('PERCUTANEOUS','Percutánea','Percutaneous',3), ('ENDOSCOPIC','Endoscópica','Endoscopic',4),
          ('ROBOTIC','Robótica','Robotic',5)
  ) AS v(code, label_es, label_en, ord)
WHERE d.code = 'SURGICAL_APPROACH'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.tenant_id IS NULL AND cv.code = v.code);

-- SURGERY_OUTCOME
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system)
SELECT d.id, v.code, v.label_es, v.label_en, v.ord, TRUE
FROM params.domain_catalogs d,
  (VALUES ('SUCCESS','Exitosa, sin complicaciones','Successful, no complications',1),
          ('MINOR_COMPLICATIONS','Exitosa, con complicaciones menores','Successful, minor complications',2),
          ('MAJOR_COMPLICATIONS','Con complicaciones mayores','Major complications',3),
          ('FAILED','Fallida','Failed',4)
  ) AS v(code, label_es, label_en, ord)
WHERE d.code = 'SURGERY_OUTCOME'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.tenant_id IS NULL AND cv.code = v.code);
