-- ============================================================
-- Pedido explícito del usuario: "revisa bien que no se duplique
-- antecedentes en los formularios cuando hace las consultas y se pone
-- lo mismo" — SKIP_IF_ALREADY_HAS_SQL (ai.service.ts, ver también
-- proposed-interview-question-source-tracking.sql) solo saltea
-- preguntas ya contestadas para CONDITION y SURGERY (las únicas dos
-- con source_question_id hoy) — las preguntas fijas de MEDICATION
-- (CURRENT_MEDICATIONS, ANTICOAGULANTS), ALLERGY (ALLERGIES) e
-- IMPLANT_DEVICE (ninguna hoy, pero se cubre por consistencia) se
-- volvían a preguntar SIEMPRE en una consulta de seguimiento, aunque
-- ya estuvieran contestadas.
-- ============================================================

ALTER TABLE clinical.medications
  ADD COLUMN IF NOT EXISTS source_question_id UUID REFERENCES ai.interview_questions(id);

ALTER TABLE clinical.allergies
  ADD COLUMN IF NOT EXISTS source_question_id UUID REFERENCES ai.interview_questions(id);

ALTER TABLE clinical.implants_devices
  ADD COLUMN IF NOT EXISTS source_question_id UUID REFERENCES ai.interview_questions(id);
