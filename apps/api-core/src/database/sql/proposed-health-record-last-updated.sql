-- ============================================================
-- Pedido explícito del usuario: poder decirle al viajero cuándo fue la
-- última vez que cargó/actualizó algo en su Historial de Salud, y que
-- esto funcione sin importar POR CUÁL de las distintas formas de
-- cargar datos haya entrado (chat Clásico, chat Estructurado, o
-- cualquiera de los formularios manuales de alergias/condiciones/
-- medicamentos/cirugías/implantes). Un trigger a nivel de base cubre
-- todas las variantes automáticamente, presentes y futuras, sin tener
-- que tocar cada controller uno por uno.
-- ============================================================

ALTER TABLE core.persons
  ADD COLUMN IF NOT EXISTS health_record_last_updated_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION core.touch_health_record_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE core.persons
  SET health_record_last_updated_at = NOW()
  WHERE id = COALESCE(NEW.person_id, OLD.person_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_health_record_conditions ON clinical.conditions;
CREATE TRIGGER trg_touch_health_record_conditions
  AFTER INSERT OR UPDATE OR DELETE ON clinical.conditions
  FOR EACH ROW EXECUTE FUNCTION core.touch_health_record_updated_at();

DROP TRIGGER IF EXISTS trg_touch_health_record_allergies ON clinical.allergies;
CREATE TRIGGER trg_touch_health_record_allergies
  AFTER INSERT OR UPDATE OR DELETE ON clinical.allergies
  FOR EACH ROW EXECUTE FUNCTION core.touch_health_record_updated_at();

DROP TRIGGER IF EXISTS trg_touch_health_record_medications ON clinical.medications;
CREATE TRIGGER trg_touch_health_record_medications
  AFTER INSERT OR UPDATE OR DELETE ON clinical.medications
  FOR EACH ROW EXECUTE FUNCTION core.touch_health_record_updated_at();

DROP TRIGGER IF EXISTS trg_touch_health_record_surgeries ON clinical.surgeries;
CREATE TRIGGER trg_touch_health_record_surgeries
  AFTER INSERT OR UPDATE OR DELETE ON clinical.surgeries
  FOR EACH ROW EXECUTE FUNCTION core.touch_health_record_updated_at();

DROP TRIGGER IF EXISTS trg_touch_health_record_implants ON clinical.implants_devices;
CREATE TRIGGER trg_touch_health_record_implants
  AFTER INSERT OR UPDATE OR DELETE ON clinical.implants_devices
  FOR EACH ROW EXECUTE FUNCTION core.touch_health_record_updated_at();
