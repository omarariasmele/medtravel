-- ============================================================
-- Pedido explícito del usuario: "todo el sistema de IA del celular
-- debería poder manejar bien todas las enfermedades existentes o
-- análisis o estudios, o medicamentos, no podemos limitarlo a lo
-- básico" — Estructurado y Formulario recorren una tabla FIJA de
-- preguntas (a diferencia de Clásico, que es libre por diseño). Esta
-- migración agrega UNA pregunta de cierre abierta al final de la
-- tabla ("¿hay algo más...?"), interpretada por interpretOpenEndedAnswer
-- (openai.provider.ts) que clasifica libremente cualquier cosa que el
-- viajero mencione en el proposalType correcto (CONDITION, MEDICATION,
-- ALLERGY, SURGERY, IMPLANT_DEVICE, VITALS o LAB_RESULT) — mismo
-- criterio que ya usa el modelo Clásico, ahora también disponible acá.
--
-- El código (ai.service.ts) identifica esta pregunta puntual por su
-- proposal_type = 'OPEN_ENDED' (no por su id/code) — de ahí que el
-- CHECK de la tabla necesite conocer este valor nuevo.
-- ============================================================

ALTER TABLE ai.interview_questions DROP CONSTRAINT IF EXISTS interview_questions_proposal_type_check;
ALTER TABLE ai.interview_questions ADD CONSTRAINT interview_questions_proposal_type_check
  CHECK (proposal_type::text = ANY (ARRAY[
    'MEDICATION', 'ALLERGY', 'CONDITION', 'SURGERY', 'IMPLANT_DEVICE', 'OPEN_ENDED'
  ]::text[]));

INSERT INTO ai.interview_questions
  (code, group_label, question_text, question_text_en, question_text_pt, question_text_fr,
   free_text_enabled, options, asks_date, proposal_type, catalog_domain_code, display_order)
VALUES (
  'OPEN_ENDED_CATCH_ALL',
  'Otros antecedentes',
  '¿Hay algo más de tu salud que quieras contarme — otra enfermedad, medicamento, análisis o estudio, cirugía, alergia o algo implantado — que no te haya preguntado antes?',
  'Is there anything else about your health you''d like to tell me — another condition, medication, lab test or study, surgery, allergy, or something implanted — that I haven''t asked about yet?',
  'Há mais alguma coisa sobre a sua saúde que queira me contar — outra doença, medicamento, exame ou estudo, cirurgia, alergia ou algo implantado — que eu ainda não tenha perguntado?',
  'Y a-t-il autre chose à propos de votre santé que vous aimeriez me dire — une autre maladie, un médicament, une analyse ou un examen, une chirurgie, une allergie ou quelque chose d''implanté — que je ne vous ai pas encore demandé ?',
  TRUE, NULL, FALSE, 'OPEN_ENDED', NULL, 270
)
ON CONFLICT (code) DO NOTHING;
