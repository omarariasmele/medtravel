-- ============================================================
-- Pedido explícito del usuario: "si el usuario no tiene cargado su
-- peso y altura y grupo sanguíneo, el estructurado lo debería
-- solicitar para poder registrarlo, esto lo hace bien el formulario,
-- tenemos que agregarlo al estructurado" — Estructurado solo camina
-- ai.interview_questions (que nunca tuvo una fila para peso/altura/
-- grupo sanguíneo, ver AIService.getMissingVitalsQuestion), así que
-- nunca los pedía. Se agrega 'VITALS_INTAKE' como un pending_step más
-- (turno especial ANTES de la primera pregunta normal, ver
-- structuredIntakeChat) — no una fila de interview_questions, porque
-- necesita capturar 3 valores juntos en una sola respuesta, algo que
-- el mecanismo genérico de detail+fecha no contempla.
-- ============================================================

ALTER TABLE ai.interview_sessions DROP CONSTRAINT IF EXISTS interview_sessions_pending_step_check;
ALTER TABLE ai.interview_sessions ADD CONSTRAINT interview_sessions_pending_step_check
  CHECK (pending_step::text = ANY (ARRAY['YES_NO', 'FOLLOWUP', 'CONFIRM_CORRECTION', 'VITALS_INTAKE']::text[]));
