-- ============================================================
-- Pedido explícito del usuario: tres antecedentes nuevos para la
-- lista de referencia (Estructurado/Formulario vía ai.interview_
-- questions, y el mismo contenido replicado a mano en el prompt de
-- Clásico — ver openai.provider.ts SYSTEM_PROMPT, que no lee esta
-- tabla, comentario explícito en buildRealtimeInstructions):
--
-- - ENDOCARDITIS: va en el bloque cardiovascular, justo después de
--   infarto de miocardio (display_order 40) y antes de angioplastia
--   coronaria (50) — mismo patrón que MYOCARDIAL_INFARCTION/STROKE
--   (nombre fijo, sin opciones).
-- - FRACTURES: va después de gota (80). Pedido explícito del usuario:
--   "una persona puede haber tenido más de una fractura" — no hay un
--   mecanismo de "repetir la pregunta" para antecedentes sueltos (a
--   diferencia de medicamentos/alergias, que sí lo tienen, ver
--   getExistingItemsSummary) así que se resuelve en el TEXTO de la
--   pregunta: se le pide explícitamente que cuente cada fractura por
--   separado con lugar y fecha — el mecanismo de "varios proposals en
--   la misma respuesta" ya existe (mismo que usa medicamentos), solo
--   hacía falta pedirlo así en esta pregunta puntual.
-- - BONE_DISEASE: mismo patrón que DIABETES (options con las variantes
--   más comunes, free_text_enabled TRUE para cualquier otra que no
--   esté en la lista — nunca hace falta un "Otra" literal, el modelo
--   ya usa lo que diga el viajero si no matchea ninguna opción).
-- ============================================================

INSERT INTO ai.interview_questions
  (code, group_label, question_text, question_text_en, question_text_pt, question_text_fr,
   free_text_enabled, options, asks_date, proposal_type, catalog_domain_code, condition_label, display_order)
VALUES
  (
    'ENDOCARDITIS', 'Antecedentes',
    '¿Tuviste o tenés endocarditis?',
    'Have you had or do you have endocarditis?',
    'Você teve ou tem endocardite?',
    'As-tu eu ou as-tu actuellement une endocardite ?',
    FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 'Endocarditis', 45
  ),
  (
    'BONE_FRACTURE', 'Antecedentes',
    '¿Tuviste alguna fractura? Contame en qué parte del cuerpo fue y en qué fecha aproximada — si tuviste más de una, contame cada una por separado.',
    'Have you had any fractures? Tell me which part of the body and roughly when — if you''ve had more than one, tell me about each separately.',
    'Você já teve alguma fratura? Me conte em que parte do corpo foi e aproximadamente quando — se teve mais de uma, me conte cada uma separadamente.',
    'As-tu déjà eu une fracture ? Dis-moi à quel endroit du corps et à quelle date approximative — si tu en as eu plusieurs, raconte-les-moi une par une.',
    TRUE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', NULL, 85
  ),
  (
    'BONE_DISEASE', 'Antecedentes',
    '¿Tuviste o tenés alguna enfermedad ósea, como osteoporosis, osteomalacia, enfermedad de Paget u osteomielitis? Contame cuál y desde cuándo.',
    'Have you had or do you have any bone disease, such as osteoporosis, osteomalacia, Paget''s disease, or osteomyelitis? Tell me which one and since when.',
    'Você teve ou tem alguma doença óssea, como osteoporose, osteomalacia, doença de Paget ou osteomielite? Me conte qual e desde quando.',
    'As-tu eu ou as-tu actuellement une maladie osseuse, comme l''ostéoporose, l''ostéomalacie, la maladie de Paget ou l''ostéomyélite ? Dis-moi laquelle et depuis quand.',
    TRUE, ARRAY['Osteoporosis', 'Osteomalacia', 'Enfermedad de Paget', 'Osteomielitis'], TRUE, 'CONDITION', 'CONDITION_CATALOG', NULL, 87
  )
ON CONFLICT (code) DO NOTHING;
