-- ============================================================
-- Gap #28: clinical.allergies no tiene ai_assisted/ai_completed_fields
-- clinical.medications SÍ las tiene (005_clinical.sql líneas 118-119),
-- pero allergies se quedó afuera en el baseline aprobado — inconsistencia
-- entre ambas tablas, no una decisión de diseño de esta sesión.
-- ============================================================

ALTER TABLE clinical.allergies
  ADD COLUMN ai_assisted         BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN ai_completed_fields JSONB   NOT NULL DEFAULT '{}';
