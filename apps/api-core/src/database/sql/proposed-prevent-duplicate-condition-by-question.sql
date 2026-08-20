-- ============================================================
-- Bug real reportado en vivo: un usuario terminó con "Diabetes Tipo 1"
-- Y "Diabetes Tipo 2" cargadas a la vez (una por el modelo Estructurado,
-- otra por el Formulario) — un dato médico sin sentido, nadie tiene dos
-- tipos de diabetes. clinical.prevent_duplicate_condition (ya existe)
-- no lo detecta porque compara texto por prefijo, y "diabetes tipo 1"
-- no es prefijo de "diabetes tipo 2" ni viceversa.
--
-- Pedido explícito del usuario: "lo mismo debe pasar con cualquier
-- enfermedad que pueda tener varias opciones" — la solución generaliza
-- sola: cada condición ya guarda source_question_id (a qué pregunta de
-- ai.interview_questions pertenece, ver AIService). Todas las opciones
-- de una misma pregunta (ej. los 7 tipos de diabetes) comparten el
-- MISMO source_question_id — así que "dos condiciones activas con el
-- mismo source_question_id para la misma persona" es exactamente "dos
-- respuestas para la misma pregunta", sin importar qué pregunta sea ni
-- que se agregue una nueva en el futuro. Nunca actúa si
-- source_question_id es NULL (ej. texto libre del modelo Clásico, que
-- no viene de ninguna pregunta con opciones) — no se puede correlacionar.
-- ============================================================

CREATE OR REPLACE FUNCTION clinical.prevent_duplicate_condition_by_question()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'pg_catalog', 'clinical'
AS $function$
BEGIN
  IF NEW.source_question_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM clinical.conditions c
    WHERE c.person_id = NEW.person_id
      AND c.source_question_id = NEW.source_question_id
      AND c.active = TRUE
      AND c.deleted_at IS NULL
      AND c.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'Ya tenés una respuesta cargada para ese antecedente — corregila en vez de agregar una nueva' USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_duplicate_condition_by_question ON clinical.conditions;
CREATE TRIGGER trg_prevent_duplicate_condition_by_question
BEFORE INSERT OR UPDATE OF source_question_id ON clinical.conditions
FOR EACH ROW EXECUTE FUNCTION clinical.prevent_duplicate_condition_by_question();
