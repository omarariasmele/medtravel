-- ============================================================
-- Pedido explícito del usuario: el chat Estructurado tiene que poder
-- preguntar en el idioma preferido del viajero (en/pt/fr), no solo en
-- español. Se pre-traducen las 26 preguntas UNA vez (vía script,
-- ver translate-interview-questions-tmp.js) en vez de traducir con IA
-- en cada turno — mismo criterio ya usado para las etiquetas de
-- catálogo (label_en/pt/fr en params.catalog_values).
-- ============================================================

ALTER TABLE ai.interview_questions
  ADD COLUMN IF NOT EXISTS question_text_en TEXT,
  ADD COLUMN IF NOT EXISTS question_text_pt TEXT,
  ADD COLUMN IF NOT EXISTS question_text_fr TEXT;
