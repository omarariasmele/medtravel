-- ============================================================
-- Bug real reportado en vivo: "me preguntó por hipertensión arterial
-- cuando ya tenía registrada... antes hablamos que no pregunte lo que
-- ya tiene registrado" — SKIP_IF_ALREADY_HAS_SQL (ai.service.ts) salta
-- una pregunta de Estructurado SOLO si encuentra una fila con
-- source_question_id = esa pregunta. Pero el modelo Clásico NUNCA
-- seteaba source_question_id (no tiene concepto de "pregunta" — ver
-- resolveSourceQuestionIdByLabel, que solo funciona para preguntas CON
-- opciones, ej. Diabetes) — cualquier antecedente cargado por Clásico
-- para una pregunta de enfermedad ÚNICA (ej. "Hipertensión arterial",
-- sin opciones) quedaba con source_question_id NULL para siempre, y
-- Estructurado la volvía a preguntar sin importar que ya estuviera.
--
-- Backfill de una sola vez: para las preguntas de enfermedad ÚNICA
-- (condition_label puntual, no las "paraguas" como enfermedad
-- cardiovascular/pulmonar/hematológica/oncológica/metabólica, que
-- agrupan varias — ahí SÍ tiene sentido seguir preguntando aunque ya
-- se sepa una), se vincula cualquier clinical.conditions existente
-- cuyo nombre (sin mayúsculas/tildes) coincida exactamente con el
-- condition_label de la pregunta, o con una de sus opciones (Diabetes).
-- ============================================================

UPDATE clinical.conditions c
SET source_question_id = q.id
FROM ai.interview_questions q
WHERE c.source_question_id IS NULL
  AND c.deleted_at IS NULL
  AND q.proposal_type = 'CONDITION'
  AND q.condition_label IS NOT NULL
  AND lower(trim(core.decrypt_pii(c.condition_name))) = lower(trim(q.condition_label));

-- Diabetes: la pregunta no tiene condition_label puntual (usa options
-- con los 3+ subtipos) — se vincula por coincidencia con cualquiera de
-- esas opciones.
UPDATE clinical.conditions c
SET source_question_id = q.id
FROM ai.interview_questions q
WHERE c.source_question_id IS NULL
  AND c.deleted_at IS NULL
  AND q.code = 'DIABETES'
  AND q.options IS NOT NULL
  AND lower(trim(core.decrypt_pii(c.condition_name))) = ANY (
    SELECT lower(trim(o)) FROM unnest(q.options) AS o
  );
