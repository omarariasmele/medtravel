-- ============================================================
-- Módulo de IA (MTA-103) — Paso 2: persistencia real de conversaciones,
-- mensajes (con tokens/costo para el dashboard de consumo pedido por el
-- usuario) y propuestas estructuradas (MEDICATION/ALLERGY) que solo se
-- vuelven registros clínicos reales cuando el viajero confirma en el
-- chat — nunca antes.
--
-- Nada de esto usa params.catalog_values para sus propios enumerados
-- (conversation_type/sender/proposal_type/status): son enumerados
-- internos del módulo de IA, nunca expuestos a i18n ni override por
-- tenant, mismo criterio ya usado para status_authority en
-- coverage.travel_assistance_enrollments (VARCHAR + CHECK, no catálogo).
--
-- Sí se agrega UN valor nuevo a un catálogo YA existente:
-- PROVENANCE_TYPE.AI_ASSISTED — porque clinical.allergies/medications
-- YA tienen las columnas ai_assisted/ai_completed_fields/provenance_id/
-- confirmation_status_id (modelo MTA-511, ver allergy.entity.ts) y este
-- módulo las reutiliza tal cual en vez de inventar una tabla paralela
-- de "propuestas clínicas" — ai.proposals solo guarda la propuesta
-- CRUDA de la IA + un link al registro clínico resultante una vez
-- confirmado, para trazabilidad/auditoría del chat, no como fuente de
-- verdad clínica.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS ai;

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, 'AI_ASSISTED', 'Asistido por IA', 'AI-assisted', 4, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
WHERE dc.code = 'PROVENANCE_TYPE'
ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------
-- ai.conversations
-- ------------------------------------------------------------
CREATE TABLE ai.conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id         UUID NOT NULL REFERENCES core.persons(id),
  conversation_type VARCHAR(30) NOT NULL CHECK (conversation_type IN (
                       'HEALTH_DATA_CAPTURE', 'APPLICATION_HELP'
                     )),
  status            VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'FINISHED')),
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_conversations_person ON ai.conversations(person_id, created_at DESC);

ALTER TABLE ai.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.conversations FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_conversations_select ON ai.conversations
  FOR SELECT USING (
    person_id = app.current_uuid('app.current_person_id')
    OR core.current_operator_can_manage_config()
  );
CREATE POLICY ai_conversations_insert ON ai.conversations
  FOR INSERT WITH CHECK (person_id = app.current_uuid('app.current_person_id'));
CREATE POLICY ai_conversations_update ON ai.conversations
  FOR UPDATE USING (person_id = app.current_uuid('app.current_person_id'))
  WITH CHECK (person_id = app.current_uuid('app.current_person_id'));

GRANT SELECT, INSERT, UPDATE ON ai.conversations TO app_runtime;

-- ------------------------------------------------------------
-- ai.messages — mensaje.message se cifra (puede contener datos de
-- salud, ej. "Tomo Rosuvastatina 5mg") con el mismo core.encrypt_pii
-- usado en todo el resto del sistema para PII/datos clínicos.
-- ------------------------------------------------------------
CREATE TABLE ai.messages (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id    UUID NOT NULL REFERENCES ai.conversations(id),
  person_id          UUID NOT NULL REFERENCES core.persons(id),
  sender             VARCHAR(20) NOT NULL CHECK (sender IN ('USER', 'ASSISTANT', 'SYSTEM')),
  message            BYTEA NOT NULL,
  provider           VARCHAR(30) NOT NULL,
  model              VARCHAR(100),
  tokens_input       INTEGER,
  tokens_output      INTEGER,
  estimated_cost_usd NUMERIC(10, 6),
  processing_ms      INTEGER,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ai_messages_conversation ON ai.messages(conversation_id, created_at);
CREATE INDEX idx_ai_messages_person_date ON ai.messages(person_id, created_at);

ALTER TABLE ai.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.messages FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_messages_select ON ai.messages
  FOR SELECT USING (
    person_id = app.current_uuid('app.current_person_id')
    OR core.current_operator_can_manage_config()
  );
CREATE POLICY ai_messages_insert ON ai.messages
  FOR INSERT WITH CHECK (person_id = app.current_uuid('app.current_person_id'));

GRANT SELECT, INSERT ON ai.messages TO app_runtime;

-- ------------------------------------------------------------
-- ai.proposals
-- ------------------------------------------------------------
CREATE TABLE ai.proposals (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id        UUID NOT NULL REFERENCES ai.conversations(id),
  message_id             UUID REFERENCES ai.messages(id),
  person_id              UUID NOT NULL REFERENCES core.persons(id),
  proposal_type          VARCHAR(30) NOT NULL CHECK (proposal_type IN ('MEDICATION', 'ALLERGY')),
  confidence             NUMERIC(4, 3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  status                 VARCHAR(30) NOT NULL DEFAULT 'PENDING_CONFIRMATION' CHECK (status IN (
                            'PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED', 'EXPIRED'
                          )),
  json_data              JSONB NOT NULL,
  provider               VARCHAR(30) NOT NULL,
  model                  VARCHAR(100),
  resulting_record_id    UUID,
  resulting_record_table VARCHAR(100),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at           TIMESTAMPTZ,
  rejected_at            TIMESTAMPTZ
);

CREATE INDEX idx_ai_proposals_conversation ON ai.proposals(conversation_id);
CREATE INDEX idx_ai_proposals_person ON ai.proposals(person_id, created_at DESC);

ALTER TABLE ai.proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.proposals FORCE ROW LEVEL SECURITY;

CREATE POLICY ai_proposals_select ON ai.proposals
  FOR SELECT USING (
    person_id = app.current_uuid('app.current_person_id')
    OR core.current_operator_can_manage_config()
  );
CREATE POLICY ai_proposals_insert ON ai.proposals
  FOR INSERT WITH CHECK (person_id = app.current_uuid('app.current_person_id'));
CREATE POLICY ai_proposals_update ON ai.proposals
  FOR UPDATE USING (person_id = app.current_uuid('app.current_person_id'))
  WITH CHECK (person_id = app.current_uuid('app.current_person_id'));

GRANT SELECT, INSERT, UPDATE ON ai.proposals TO app_runtime;

-- ------------------------------------------------------------
-- Vista de consumo diario por persona — base del dashboard de costos/
-- tokens pedido por el usuario ("promedio de consumo, quien consumió
-- más que otro"). Se expone de solo lectura a operadores con permiso
-- de config (mismo gate que el resto de las pantallas de plataforma).
-- ------------------------------------------------------------
CREATE VIEW ai.consumption_daily AS
SELECT
  m.person_id,
  date_trunc('day', m.created_at) AS day,
  m.provider,
  m.model,
  COUNT(*) FILTER (WHERE m.sender = 'ASSISTANT') AS assistant_messages,
  SUM(m.tokens_input)  AS tokens_input,
  SUM(m.tokens_output) AS tokens_output,
  SUM(m.estimated_cost_usd) AS estimated_cost_usd
FROM ai.messages m
WHERE m.sender = 'ASSISTANT'
GROUP BY m.person_id, date_trunc('day', m.created_at), m.provider, m.model;

GRANT SELECT ON ai.consumption_daily TO app_runtime;
