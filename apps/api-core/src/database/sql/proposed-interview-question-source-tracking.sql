-- ============================================================
-- Bug real reportado en vivo: el modelo Estructurado volvía a
-- preguntar "¿Tuvo o tiene alguna Enfermedad pulmonar crónica?" aunque
-- ya hubiera confirmado "Asma" ahí antes — SKIP_IF_ALREADY_HAS_SQL
-- (ai.service.ts) comparaba el código de la pregunta
-- (CHRONIC_LUNG_DISEASE) contra el código del catálogo resuelto para
-- la respuesta (ASTHMA), que nunca coinciden en preguntas "paraguas"
-- que agrupan varias enfermedades puntuales (CARDIOVASCULAR_DISEASE,
-- CHRONIC_LUNG_DISEASE, HEMATOLOGIC_DISEASE, ONCOLOGIC_DISEASE,
-- METABOLIC_DISEASE). Se reemplaza la comparación de códigos por un
-- vínculo directo: qué pregunta originó cada antecedente.
-- ============================================================

ALTER TABLE clinical.conditions
  ADD COLUMN IF NOT EXISTS source_question_id UUID REFERENCES ai.interview_questions(id);

ALTER TABLE clinical.surgeries
  ADD COLUMN IF NOT EXISTS source_question_id UUID REFERENCES ai.interview_questions(id);
