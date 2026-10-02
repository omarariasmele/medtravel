-- ============================================================
-- Bug real encontrado revisando la carga de "Fracturas" (pedido
-- explícito del usuario: "una persona puede haber tenido más de una
-- fractura, en huesos distintos, dando lugar a que pueda poner más de
-- una de ser necesario"): clinical.prevent_duplicate_condition_by_question
-- (proposed-prevent-duplicate-condition-by-question.sql) bloquea CUALQUIER
-- segunda condición activa con el mismo source_question_id para la
-- misma persona — a propósito para preguntas de opción única (ej. los
-- 7 tipos de diabetes, donde una segunda respuesta SÍ es un error de
-- carga). Fracturas es la primera pregunta genuinamente
-- multi-instancia (varias fracturas reales, cada una con su propio
-- lugar y fecha) — sin este cambio, el SEGUNDO proposal de fractura
-- (venga de Clásico, Estructurado o Formulario, los tres pasan por
-- este mismo trigger vía clinical.conditions) se rechazaba como
-- "duplicado", silenciosamente perdido.
--
-- Se agrega una columna en vez de hardcodear el código de la pregunta
-- en el trigger — generaliza sola para la próxima pregunta que
-- necesite lo mismo, sin tocar SQL de nuevo. Default FALSE preserva el
-- comportamiento actual para las 30 preguntas existentes.
-- ============================================================

ALTER TABLE ai.interview_questions
  ADD COLUMN IF NOT EXISTS allows_multiple_answers BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE ai.interview_questions SET allows_multiple_answers = TRUE WHERE code = 'BONE_FRACTURE';

CREATE OR REPLACE FUNCTION clinical.prevent_duplicate_condition_by_question()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = 'pg_catalog', 'clinical', 'ai'
AS $function$
BEGIN
  IF NEW.source_question_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM ai.interview_questions q
    WHERE q.id = NEW.source_question_id AND q.allows_multiple_answers = TRUE
  ) THEN
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
