-- Gap real encontrado en vivo: se agregó el proposalType LAB_RESULT
-- (ai-provider.interface.ts, openai.provider.ts, ai.service.ts) para
-- que la IA pueda guardar estudios/análisis que el viajero cuenta en la
-- charla — clinical.lab_results ya existía en el schema sin usar. Pero
-- ai.proposals tiene un CHECK a nivel de base que no lo conocía todavía
-- (mismo patrón que MEDICATION/ALLERGY/CONDITION/SURGERY/VITALS ya
-- sembrados en el baseline) — el INSERT fallaba con
-- "proposals_proposal_type_check" aunque el código ya generaba y
-- validaba el proposal correctamente.

ALTER TABLE ai.proposals DROP CONSTRAINT proposals_proposal_type_check;

ALTER TABLE ai.proposals ADD CONSTRAINT proposals_proposal_type_check
  CHECK (proposal_type::text = ANY (ARRAY[
    'MEDICATION', 'ALLERGY', 'CONDITION', 'SURGERY', 'VITALS', 'LAB_RESULT'
  ]::text[]));
