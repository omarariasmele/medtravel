-- ============================================================
-- Pedido explícito del usuario (modelo Estructurado): las preguntas
-- condicionantes tienen que pedir CLARAMENTE "indique sí o no"
-- primero — y SOLO si contesta que sí, recién ahí pedir en un turno
-- aparte lo que falte (el detalle si la pregunta admite texto libre,
-- Y la fecha si la pregunta la pide) — antes se mostraba todo junto
-- desde el principio, lo cual confundía. `answers` (ya existía, sin
-- uso) guarda lo que ya se sacó de la respuesta "sí" mientras se
-- espera ese turno de seguimiento, para combinarlo con lo que llegue
-- después sin volver a preguntar lo que ya se sabe.
-- ============================================================

ALTER TABLE ai.interview_sessions
  ADD COLUMN IF NOT EXISTS pending_step VARCHAR(10) NOT NULL DEFAULT 'YES_NO'
    CHECK (pending_step IN ('YES_NO', 'FOLLOWUP'));
