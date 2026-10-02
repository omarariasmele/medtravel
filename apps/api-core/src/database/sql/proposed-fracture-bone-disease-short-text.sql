-- ============================================================
-- Bug real reportado en vivo (pantalla de Formulario): el texto largo
-- de BONE_FRACTURE/BONE_DISEASE (pensado para que la IA lo diga en una
-- charla) se estaba usando TAL CUAL como label del checkbox en
-- Formulario (health_form_screen.dart::_conditionTile, "cualquier
-- pregunta con options muestra un dropdown... generalizado" — el
-- mecanismo YA es genérico, options ya arma el dropdown de
-- Osteoporosis/Osteomalacia/etc. solo, el problema era únicamente el
-- texto). Se acorta question_text al mismo patrón corto que ya usa
-- DIABETES ("¿Tenés diabetes?") — el detalle de "contame cuál y
-- desde cuándo"/"si tuviste más de una, contame cada una por separado"
-- queda solo en las instrucciones de Clásico (SYSTEM_PROMPT/
-- buildRealtimeInstructions en openai.provider.ts, ya actualizadas),
-- nunca en el texto de la pregunta en sí.
-- ============================================================

UPDATE ai.interview_questions
SET question_text = '¿Tuviste alguna fractura?',
    question_text_en = 'Have you had any fractures?',
    question_text_pt = 'Você já teve alguma fratura?',
    question_text_fr = 'As-tu déjà eu une fracture ?'
WHERE code = 'BONE_FRACTURE';

UPDATE ai.interview_questions
SET question_text = '¿Tuviste o tenés alguna enfermedad ósea?',
    question_text_en = 'Have you had or do you have any bone disease?',
    question_text_pt = 'Você teve ou tem alguma doença óssea?',
    question_text_fr = 'As-tu eu ou as-tu actuellement une maladie osseuse ?'
WHERE code = 'BONE_DISEASE';
