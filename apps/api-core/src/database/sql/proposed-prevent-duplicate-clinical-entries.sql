-- ============================================================
-- Gap #46: el sistema permitía cargar la misma alergia/comorbilidad/
-- medicamento varias veces para la misma persona sin ningún aviso —
-- reportado por el usuario con captura real: "Penicilina (SEVERE)"
-- aparecía 4 veces (con mayúscula/minúscula distinta) y
-- "rosuvastatina" 2 veces en la vista que ve el médico por QR. Esto es
-- un riesgo real, no solo estético: un médico viendo alergias
-- repetidas no sabe si son la misma o distintas.
--
-- Se implementa como TRIGGER (no como chequeo en cada controller) a
-- propósito: hay al menos tres caminos de inserción distintos para
-- estas tablas (CRUD genérico /clinical/:resource que usa la app
-- móvil, me-clinical.controller.ts, y ai.service.ts::confirmProposal
-- para lo que confirma el asistente de IA) — un trigger a nivel de
-- base los cubre a todos de una sola vez, sin duplicar la lógica ni
-- arriesgarse a que un cuarto camino futuro se olvide de chequear.
--
-- Comparación EXACTA (insensible a mayúsculas/espacios), no difusa:
-- "diabetes" y "diabetes tipo 2" son entradas legítimamente distintas
-- (no se tocan), solo se bloquea el duplicado real como "Penicilina"/
-- "penicilina". Solo mira filas activas (active=TRUE, deleted_at NULL)
-- de la MISMA persona — una alergia dada de baja no bloquea volver a
-- cargarla.
--
-- SQLSTATE 23505 (unique_violation) a propósito: pg-error.mapper.ts ya
-- traduce ese código a 409 Conflict en el camino del CRUD genérico
-- (RlsCrudService) sin ningún cambio — mismo mapeo que cualquier
-- UNIQUE real.
-- ============================================================

CREATE OR REPLACE FUNCTION clinical.prevent_duplicate_allergy()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, clinical, core AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM clinical.allergies a
    WHERE a.person_id = NEW.person_id
      AND a.active = TRUE
      AND a.deleted_at IS NULL
      AND a.id <> NEW.id
      AND lower(trim(core.decrypt_pii(a.allergen_name))) = lower(trim(core.decrypt_pii(NEW.allergen_name)))
  ) THEN
    RAISE EXCEPTION 'Ya tenés cargada la alergia "%"', core.decrypt_pii(NEW.allergen_name) USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_allergy ON clinical.allergies;
CREATE TRIGGER trg_prevent_duplicate_allergy
  BEFORE INSERT OR UPDATE OF allergen_name ON clinical.allergies
  FOR EACH ROW EXECUTE FUNCTION clinical.prevent_duplicate_allergy();

CREATE OR REPLACE FUNCTION clinical.prevent_duplicate_condition()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, clinical, core AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM clinical.conditions c
    WHERE c.person_id = NEW.person_id
      AND c.active = TRUE
      AND c.deleted_at IS NULL
      AND c.id <> NEW.id
      AND lower(trim(core.decrypt_pii(c.condition_name))) = lower(trim(core.decrypt_pii(NEW.condition_name)))
  ) THEN
    RAISE EXCEPTION 'Ya tenés cargada la comorbilidad "%"', core.decrypt_pii(NEW.condition_name) USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_condition ON clinical.conditions;
CREATE TRIGGER trg_prevent_duplicate_condition
  BEFORE INSERT OR UPDATE OF condition_name ON clinical.conditions
  FOR EACH ROW EXECUTE FUNCTION clinical.prevent_duplicate_condition();

CREATE OR REPLACE FUNCTION clinical.prevent_duplicate_medication()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, clinical, core AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM clinical.medications m
    WHERE m.person_id = NEW.person_id
      AND m.active = TRUE
      AND m.deleted_at IS NULL
      AND m.id <> NEW.id
      AND lower(trim(core.decrypt_pii(m.generic_name))) = lower(trim(core.decrypt_pii(NEW.generic_name)))
  ) THEN
    RAISE EXCEPTION 'Ya tenés cargado el medicamento "%"', core.decrypt_pii(NEW.generic_name) USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_medication ON clinical.medications;
CREATE TRIGGER trg_prevent_duplicate_medication
  BEFORE INSERT OR UPDATE OF generic_name ON clinical.medications
  FOR EACH ROW EXECUTE FUNCTION clinical.prevent_duplicate_medication();

-- A diferencia de alergias/comorbilidades/medicamentos, cirugías e
-- implantes SÍ pueden repetirse legítimamente (dos cirugías del mismo
-- tipo en fechas distintas) — por eso acá se compara nombre + fecha
-- juntos, no solo el nombre. Documentados acá (antes solo vivían en la
-- base, aplicados a mano) para que quede registro y sean fáciles de
-- reaplicar si se recrea el ambiente.
CREATE OR REPLACE FUNCTION clinical.prevent_duplicate_surgery()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, clinical, core AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM clinical.surgeries s
    WHERE s.person_id = NEW.person_id
      AND s.deleted_at IS NULL
      AND s.id <> NEW.id
      AND lower(trim(core.decrypt_pii(s.procedure_name))) = lower(trim(core.decrypt_pii(NEW.procedure_name)))
      AND s.performed_at = NEW.performed_at
  ) THEN
    RAISE EXCEPTION 'Ya tenés cargada la cirugía "%" en esa fecha', core.decrypt_pii(NEW.procedure_name) USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_surgery ON clinical.surgeries;
CREATE TRIGGER trg_prevent_duplicate_surgery
  BEFORE INSERT OR UPDATE OF procedure_name, performed_at ON clinical.surgeries
  FOR EACH ROW EXECUTE FUNCTION clinical.prevent_duplicate_surgery();

CREATE OR REPLACE FUNCTION clinical.prevent_duplicate_implant()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = pg_catalog, clinical, core AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM clinical.implants_devices d
    WHERE d.person_id = NEW.person_id
      AND d.active = TRUE
      AND d.deleted_at IS NULL
      AND d.id <> NEW.id
      AND lower(trim(core.decrypt_pii(d.device_name))) = lower(trim(core.decrypt_pii(NEW.device_name)))
      AND d.implanted_at IS NOT DISTINCT FROM NEW.implanted_at
  ) THEN
    RAISE EXCEPTION 'Ya tenés cargado el implante/dispositivo "%"', core.decrypt_pii(NEW.device_name) USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_implant ON clinical.implants_devices;
CREATE TRIGGER trg_prevent_duplicate_implant
  BEFORE INSERT OR UPDATE OF device_name, implanted_at ON clinical.implants_devices
  FOR EACH ROW EXECUTE FUNCTION clinical.prevent_duplicate_implant();
