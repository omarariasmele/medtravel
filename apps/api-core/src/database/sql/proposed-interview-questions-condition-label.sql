-- ============================================================
-- Bug real reportado en vivo: cuando el viajero contesta "sí" a una
-- pregunta de antecedente SIN agregar ningún detalle propio (ej.
-- "¿Padece de gota?" -> solo confirma, no dice nada más), tanto el
-- modelo Estructurado como el Formulario usaban el TEXTO DE LA
-- PREGUNTA tal cual como conditionName ("¿Padece de gota?" en vez de
-- "Gota") — quedaba guardado así en clinical.conditions para siempre,
-- se veía repetido/raro en la ficha, y además evitaba que
-- CatalogResolutionService lo matcheara contra el catálogo real
-- (¿Padece de gota? nunca es igual a "Gota" en el catálogo).
--
-- condition_label es la etiqueta LIMPIA a usar como conditionName en
-- ese caso (fallback cuando no hay detalle) — editable desde admin-web
-- (interview-questions.page.tsx) como cualquier otro campo de la
-- pregunta, nunca hardcodeada en el código de la app o del backend,
-- siguiendo el mismo criterio de "nada fijo, todo en tablas dinámicas"
-- ya aplicado al resto de esta tabla.
-- ============================================================

ALTER TABLE ai.interview_questions ADD COLUMN IF NOT EXISTS condition_label TEXT;

UPDATE ai.interview_questions SET condition_label = v.label
FROM (VALUES
  ('CARDIOVASCULAR_DISEASE', 'Enfermedad cardiovascular'),
  ('CHRONIC_LUNG_DISEASE', 'Enfermedad pulmonar crónica'),
  ('STROKE', 'Accidente cerebrovascular'),
  ('MYOCARDIAL_INFARCTION', 'Infarto de miocardio'),
  ('DIABETES', 'Diabetes'),
  ('GOUT', 'Gota'),
  ('HEMATOLOGIC_DISEASE', 'Enfermedad hematológica'),
  ('TRANSIENT_ISCHEMIC_ATTACK', 'Isquemia cerebral transitoria'),
  ('PARKINSON', 'Enfermedad de Parkinson'),
  ('HYPERTENSION', 'Hipertensión arterial'),
  ('PEPTIC_ULCER', 'Enfermedad ulcerosa gastroduodenal'),
  ('DIVERTICULAR_DISEASE', 'Enfermedad diverticular del colon'),
  ('RENAL_COLIC', 'Cólico renal'),
  ('BILIARY_COLIC', 'Cólico biliar'),
  ('ONCOLOGIC_DISEASE', 'Enfermedad oncológica'),
  ('ATRIAL_FIBRILLATION', 'Fibrilación auricular'),
  ('METABOLIC_DISEASE', 'Enfermedad metabólica'),
  ('CHRONIC_SINUSITIS', 'Sinusitis crónica'),
  ('CHRONIC_RENAL_FAILURE', 'Insuficiencia renal crónica'),
  ('DIALYSIS', 'Diálisis'),
  ('HEPATITIS', 'Hepatitis')
) AS v(code, label)
WHERE ai.interview_questions.code = v.code;
