-- ============================================================
-- Gap real de seguridad encontrado al construir el "historial de caso"
-- (bitácora por fecha/hora donde cada operador interviniente deja
-- notas/observaciones): operations.case_medical_events tenía GRANT
-- SELECT/INSERT para app_runtime (007_operations.sql) pero NUNCA se le
-- habilitó RLS — sin este patch, cualquier operador autenticado de
-- cualquier empresa podría leer/insertar notas de CUALQUIER caso de
-- CUALQUIER tenant. Mismo patrón que cases_access (B3,
-- 007_operations.sql): tenant del caso, o el propio viajero titular.
-- ============================================================

ALTER TABLE operations.case_medical_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE operations.case_medical_events FORCE ROW LEVEL SECURITY;

CREATE POLICY case_medical_events_access ON operations.case_medical_events
  USING (
    EXISTS (
      SELECT 1 FROM operations.emergency_cases ec
      WHERE ec.id = case_medical_events.case_id
        AND ec.tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operations.emergency_cases ec
      WHERE ec.id = case_medical_events.case_id
        AND ec.tenant_id = app.current_uuid('app.current_tenant_id')
    )
  );

-- ── MEDICAL_EVENT_TYPE: catálogo vacío, necesario para poder insertar ──
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system)
SELECT d.id, v.code, v.label_es, v.label_en, v.ord, TRUE
FROM params.domain_catalogs d,
  (VALUES
    ('GENERAL_NOTE',            'Nota / observación general',      'General note', 1),
    ('TRIAGE',                  'Triage',                          'Triage', 2),
    ('MEDICATION_ADMINISTERED', 'Medicación administrada',         'Medication administered', 3),
    ('VITALS_TAKEN',            'Toma de signos vitales',          'Vitals taken', 4),
    ('TRANSPORT_ARRANGED',      'Traslado coordinado',             'Transport arranged', 5),
    ('HOSPITAL_ADMISSION',      'Internación',                     'Hospital admission', 6),
    ('DISCHARGE',               'Alta médica',                     'Discharge', 7),
    ('ESCALATION',              'Escalamiento',                    'Escalation', 8),
    ('FOLLOW_UP_CALL',          'Llamada de seguimiento',          'Follow-up call', 9)
  ) AS v(code, label_es, label_en, ord)
WHERE d.code = 'MEDICAL_EVENT_TYPE'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.tenant_id IS NULL AND cv.code = v.code);
