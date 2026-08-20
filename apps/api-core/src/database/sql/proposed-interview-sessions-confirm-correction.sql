-- ============================================================
-- Bug real reportado en vivo: cuando la IA corregía un typo (ej.
-- "asmita" -> "Asma") avisaba "decime si me equivoqué" pero en el
-- MISMO mensaje ya preguntaba lo siguiente — nunca esperaba la
-- confirmación de verdad, así que "decime si me equivoqué" era un
-- aviso vacío, no una pregunta real. Se agrega un tercer estado de
-- sesión: CONFIRM_CORRECTION, que SÍ frena la entrevista hasta recibir
-- un sí/no antes de seguir (ver structuredIntakeChat en ai.service.ts).
-- ============================================================

ALTER TABLE ai.interview_sessions
  ALTER COLUMN pending_step TYPE VARCHAR(20);

ALTER TABLE ai.interview_sessions
  DROP CONSTRAINT IF EXISTS interview_sessions_pending_step_check;

ALTER TABLE ai.interview_sessions
  ADD CONSTRAINT interview_sessions_pending_step_check
  CHECK (pending_step IN ('YES_NO', 'FOLLOWUP', 'CONFIRM_CORRECTION'));
