-- ============================================================
-- Pedido explícito del usuario: armar un SEGUNDO modelo de carga de
-- Ficha de Salud, guiado por una tabla editable desde admin-web (sin
-- tocar el modelo Clásico conversacional que ya existe) — para poder
-- compararlos en una demo, incluido el costo real de IA que genera
-- cada uno. Esta tabla es el "guion" del modelo Estructurado: qué
-- preguntar, en qué orden, si acepta texto libre/opciones/fecha.
-- Nunca se borra una pregunta (se desactiva) — mismo criterio de
-- retención que el resto del sistema.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai.interview_questions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT UNIQUE NOT NULL,
  group_label         TEXT NOT NULL,
  question_text       TEXT NOT NULL,
  free_text_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  options             TEXT[],
  asks_date           BOOLEAN NOT NULL DEFAULT TRUE,
  proposal_type       VARCHAR(30) NOT NULL CHECK (proposal_type IN (
                         'MEDICATION', 'ALLERGY', 'CONDITION', 'SURGERY', 'IMPLANT_DEVICE'
                       )),
  catalog_domain_code TEXT,
  display_order       SMALLINT NOT NULL DEFAULT 0,
  active              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT interview_questions_options_max5 CHECK (options IS NULL OR array_length(options, 1) <= 5)
);

CREATE INDEX IF NOT EXISTS idx_interview_questions_active
  ON ai.interview_questions(active, display_order);

CREATE TRIGGER trg_interview_questions_upd
  BEFORE UPDATE ON ai.interview_questions
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

-- No RLS: es configuración global de plataforma (mismo criterio que
-- ai.knowledge_base_entries), no dato de un viajero — administrado
-- desde /ai/admin/interview-questions con ConfigAccessGuard.
GRANT SELECT, INSERT, UPDATE ON ai.interview_questions TO app_runtime;

-- ------------------------------------------------------------
-- Semillas: las 27 preguntas que pasó el usuario (se consolida el
-- ítem de ACV/isquemia cerebral transitoria, que aparecía duplicado
-- en su lista, en una sola fila — mismo criterio que ya usa el
-- modelo Clásico hoy, un solo ítem "Isquemia cerebral transitoria").
-- ------------------------------------------------------------
INSERT INTO ai.interview_questions
  (code, group_label, question_text, free_text_enabled, options, asks_date, proposal_type, catalog_domain_code, display_order)
VALUES
  ('CARDIOVASCULAR_DISEASE', 'Antecedentes', '¿Tuvo o tiene alguna enfermedad cardiovascular?', TRUE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 10),
  ('CHRONIC_LUNG_DISEASE', 'Antecedentes', '¿Tuvo o tiene alguna enfermedad pulmonar crónica?', TRUE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 20),
  ('STROKE', 'Antecedentes', '¿Tuvo un accidente cerebrovascular?', FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 30),
  ('MYOCARDIAL_INFARCTION', 'Antecedentes', '¿Ha tenido un infarto de miocardio?', FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 40),
  ('CORONARY_ANGIOPLASTY', 'Antecedentes', '¿Le han practicado una angioplastia coronaria?', FALSE, NULL, TRUE, 'SURGERY', 'SURGERY_CATALOG', 50),
  ('OTHER_ANGIOPLASTY', 'Antecedentes', '¿Le han practicado alguna angioplastia en otra parte del cuerpo?', TRUE, NULL, TRUE, 'SURGERY', 'SURGERY_CATALOG', 60),
  ('DIABETES', 'Antecedentes', '¿Tiene diabetes?', TRUE, ARRAY['Diabetes Tipo 1', 'Diabetes Tipo 2', 'Diabetes Gestacional'], TRUE, 'CONDITION', 'CONDITION_CATALOG', 70),
  ('GOUT', 'Antecedentes', '¿Padece de gota?', FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 80),
  ('HEMATOLOGIC_DISEASE', 'Antecedentes', '¿Padece una enfermedad hematológica, como hemofilia u otro trastorno de la coagulación?', TRUE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 90),
  ('TRANSIENT_ISCHEMIC_ATTACK', 'Antecedentes', '¿Ha tenido un episodio de isquemia cerebral transitoria?', FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 100),
  ('PARKINSON', 'Antecedentes', '¿Le han diagnosticado o padece enfermedad de Parkinson?', FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 110),
  ('HYPERTENSION', 'Antecedentes', '¿Tiene hipertensión arterial?', FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 120),
  ('CURRENT_MEDICATIONS', 'Medicamentos', '¿Qué medicamentos toma?', TRUE, NULL, FALSE, 'MEDICATION', 'MEDICATION', 130),
  ('ALLERGIES', 'Antecedentes', '¿Es alérgico a algo?', TRUE, NULL, TRUE, 'ALLERGY', 'ALLERGEN', 140),
  ('PEPTIC_ULCER', 'Antecedentes', '¿Padece o ha padecido enfermedad ulcerosa gastroduodenal?', FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 150),
  ('DIVERTICULAR_DISEASE', 'Antecedentes', '¿Le han diagnosticado o ha padecido alguna vez enfermedad diverticular del colon o episodios de diverticulitis?', TRUE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 160),
  ('RENAL_COLIC', 'Antecedentes', '¿Sufrió cólicos renales?', FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 170),
  ('BILIARY_COLIC', 'Antecedentes', '¿Sufrió cólicos biliares?', FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 180),
  ('ONCOLOGIC_DISEASE', 'Antecedentes', '¿Ha sufrido o se encuentra actualmente en tratamiento por enfermedades oncológicas?', TRUE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 190),
  ('ANTICOAGULANTS', 'Medicamentos', '¿Se encuentra actualmente tomando medicación anticoagulante?', TRUE, NULL, TRUE, 'MEDICATION', 'MEDICATION', 200),
  ('ATRIAL_FIBRILLATION', 'Antecedentes', '¿Sufre o ha sufrido episodios de fibrilación auricular?', FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 210),
  ('METABOLIC_DISEASE', 'Antecedentes', '¿Padece alguna enfermedad metabólica que requiera actualmente tratamiento?', TRUE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 220),
  ('CHRONIC_SINUSITIS', 'Antecedentes', '¿Sufre o ha tenido episodios reiterados de sinusitis crónica?', FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 230),
  ('CHRONIC_RENAL_FAILURE', 'Antecedentes', '¿Padece usted de insuficiencia renal crónica?', FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 240),
  ('DIALYSIS', 'Antecedentes', '¿Ha estado en alguna oportunidad bajo tratamiento de diálisis?', FALSE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 250),
  ('HEPATITIS', 'Antecedentes', '¿Padece o ha padecido alguna forma de hepatitis?', TRUE, NULL, TRUE, 'CONDITION', 'CONDITION_CATALOG', 260)
ON CONFLICT (code) DO NOTHING;

-- ============================================================
-- Modelo Estructurado: qué conversación usó qué modelo (para poder
-- comparar costo, ver ai.get_intake_model_comparison en
-- proposed-ai-intake-model-comparison.sql) + estado del recorrido
-- pregunta-por-pregunta (a diferencia del modelo Clásico, que
-- reconstruye todo del historial de ai.messages en cada turno).
-- ============================================================

ALTER TABLE ai.conversations
  ADD COLUMN IF NOT EXISTS intake_model VARCHAR(20) NOT NULL DEFAULT 'CLASSIC'
    CHECK (intake_model IN ('CLASSIC', 'STRUCTURED'));

CREATE TABLE IF NOT EXISTS ai.interview_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL UNIQUE REFERENCES ai.conversations(id),
  person_id           UUID NOT NULL REFERENCES core.persons(id),
  current_question_id UUID REFERENCES ai.interview_questions(id),
  answers              JSONB NOT NULL DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_interview_sessions_upd
  BEFORE UPDATE ON ai.interview_sessions
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

ALTER TABLE ai.interview_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.interview_sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_interview_sessions_select ON ai.interview_sessions
  FOR SELECT USING (
    person_id = app.current_uuid('app.current_person_id')
    OR core.current_operator_can_manage_config()
  );
CREATE POLICY ai_interview_sessions_insert ON ai.interview_sessions
  FOR INSERT WITH CHECK (person_id = app.current_uuid('app.current_person_id'));
CREATE POLICY ai_interview_sessions_update ON ai.interview_sessions
  FOR UPDATE USING (person_id = app.current_uuid('app.current_person_id'))
  WITH CHECK (person_id = app.current_uuid('app.current_person_id'));

GRANT SELECT, INSERT, UPDATE ON ai.interview_sessions TO app_runtime;
