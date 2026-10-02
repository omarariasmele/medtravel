-- ============================================================
-- Bug real reportado en vivo: Silvia Ugarte tiene 2 medicamentos, 1
-- cirugía y 1 estudio de laboratorio cargados de verdad, pero la app
-- le seguía diciendo "falta cargar información de tu ficha de salud".
-- Causa: health_record_last_updated_at (proposed-health-record-last-
-- updated.sql) nunca cubrió clinical.lab_results ni
-- clinical.vitals_history — cualquier antecedente cargado SOLO en esas
-- dos tablas nunca actualiza el campo. Además, sus medicamentos/cirugía
-- son del 4/8 (antes de que ese trigger existiera) y nunca se hizo un
-- backfill para datos ya cargados en ese momento.
-- ============================================================

DROP TRIGGER IF EXISTS trg_touch_health_record_lab_results ON clinical.lab_results;
CREATE TRIGGER trg_touch_health_record_lab_results
  AFTER INSERT OR UPDATE OR DELETE ON clinical.lab_results
  FOR EACH ROW EXECUTE FUNCTION core.touch_health_record_updated_at();

DROP TRIGGER IF EXISTS trg_touch_health_record_vitals ON clinical.vitals_history;
CREATE TRIGGER trg_touch_health_record_vitals
  AFTER INSERT OR UPDATE OR DELETE ON clinical.vitals_history
  FOR EACH ROW EXECUTE FUNCTION core.touch_health_record_updated_at();

-- Backfill único: cualquier persona con al menos un antecedente real
-- (en cualquiera de las 8 tablas clínicas) pero health_record_last_
-- updated_at todavía en NULL — le pone la fecha real más reciente
-- entre sus propios registros, en vez de dejarla en NULL para siempre.
WITH latest AS (
  SELECT person_id, MAX(ts) AS last_ts FROM (
    SELECT person_id, COALESCE(updated_at, created_at) AS ts FROM clinical.conditions WHERE deleted_at IS NULL
    UNION ALL
    SELECT person_id, COALESCE(updated_at, created_at) FROM clinical.allergies WHERE deleted_at IS NULL
    UNION ALL
    SELECT person_id, COALESCE(updated_at, created_at) FROM clinical.medications WHERE deleted_at IS NULL
    UNION ALL
    SELECT person_id, COALESCE(updated_at, created_at) FROM clinical.surgeries WHERE deleted_at IS NULL
    UNION ALL
    SELECT person_id, COALESCE(updated_at, created_at) FROM clinical.implants_devices WHERE deleted_at IS NULL
    UNION ALL
    SELECT person_id, COALESCE(updated_at, created_at) FROM clinical.treatments WHERE deleted_at IS NULL
    UNION ALL
    SELECT person_id, COALESCE(updated_at, created_at) FROM clinical.lab_results WHERE deleted_at IS NULL
    UNION ALL
    SELECT person_id, created_at FROM clinical.vitals_history WHERE deleted_at IS NULL
  ) all_records
  GROUP BY person_id
)
UPDATE core.persons p
SET health_record_last_updated_at = latest.last_ts
FROM latest
WHERE p.id = latest.person_id
  AND p.health_record_last_updated_at IS NULL;
