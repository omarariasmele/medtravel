-- ============================================================
-- PROPUESTA — NO forma parte del schema SQL v1.2.3 aprobado.
--
-- Dos gaps reales encontrados al implementar el processor de
-- audit.data_anonymization_jobs:
--
-- 1) app_runtime no tiene NINGÚN grant sobre
--    audit.data_anonymization_jobs (solo el owner postgres) —
--    mismo tipo de gap que el de 002_params.sql (ver
--    fix-002-missing-params-grants.sql).
--
-- 2) La anonimización real necesita poder actualizar campos en tablas
--    con RLS (ej. core.persons, forzada, solo self-access) para un
--    row_id arbitrario — un job de background no tiene (ni debe
--    fingir tener) el app.current_person_id de nadie. Necesita el
--    mismo patrón que clinical.has_clinical_access/
--    core.get_login_credentials: una función SECURITY DEFINER,
--    acotada a esta única operación controlada, no un bypass general.
--
-- Hay que llevar ambos a revisión para la próxima versión del schema
-- aprobado (v1.2.4).
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON audit.data_anonymization_jobs TO app_runtime;

-- format('%I', ...) escapa identificadores de forma segura — no se
-- interpola ningún string crudo en el SQL dinámico. Antes de ejecutar,
-- valida contra information_schema que la columna realmente exista (así
-- un table_schema/table_name/field inválido o malicioso falla con una
-- excepción clara, no con SQL dinámico ejecutándose a ciegas).
CREATE OR REPLACE FUNCTION audit.anonymize_field(
  p_table_schema TEXT,
  p_table_name   TEXT,
  p_field        TEXT,
  p_row_id       UUID,
  p_method       TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, audit, public AS $$
DECLARE
  v_sql    TEXT;
  v_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = p_table_schema
      AND table_name = p_table_name
      AND column_name = p_field
  ) INTO v_exists;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'Columna %.%.% no existe', p_table_schema, p_table_name, p_field;
  END IF;

  IF p_method = 'HASH_IRREVERSIBLE' THEN
    v_sql := format(
      'UPDATE %I.%I SET %I = encode(digest(%I::text, ''sha256''), ''hex'') WHERE id = $1',
      p_table_schema, p_table_name, p_field, p_field
    );
  ELSIF p_method = 'PSEUDONYMIZATION' THEN
    v_sql := format(
      'UPDATE %I.%I SET %I = ''ANON-'' || substr(md5(random()::text), 1, 12) WHERE id = $1',
      p_table_schema, p_table_name, p_field
    );
  ELSE
    -- REDACT, GENERALIZATION, SUPPRESSION: a nivel de UN campo, todas
    -- degradan a NULL. Generalización real (ej. fecha exacta -> año)
    -- necesita lógica específica por tipo de columna que no se puede
    -- resolver genéricamente para cualquier tabla/campo — queda
    -- documentado como límite conocido, no resuelto acá.
    v_sql := format(
      'UPDATE %I.%I SET %I = NULL WHERE id = $1',
      p_table_schema, p_table_name, p_field
    );
  END IF;

  EXECUTE v_sql USING p_row_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION audit.anonymize_field(TEXT, TEXT, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION audit.anonymize_field(TEXT, TEXT, TEXT, UUID, TEXT) TO app_runtime;
