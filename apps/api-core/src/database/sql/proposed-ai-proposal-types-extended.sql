-- ============================================================
-- Gap #34: el asistente de IA de carga de ficha médica solo sabía
-- proponer MEDICATION y ALLERGY. El usuario pidió que también pueda
-- guiar una entrevista corta (~5 min) sobre antecedentes/condiciones,
-- cirugías, y signos vitales (peso/altura) — ai.proposals.proposal_type
-- tenía un CHECK que solo permitía los dos tipos originales.
-- ============================================================

ALTER TABLE ai.proposals DROP CONSTRAINT proposals_proposal_type_check;
ALTER TABLE ai.proposals ADD CONSTRAINT proposals_proposal_type_check
  CHECK (proposal_type IN ('MEDICATION', 'ALLERGY', 'CONDITION', 'SURGERY', 'VITALS'));
