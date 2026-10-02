-- ============================================================
-- Pedido explícito del usuario: si el médico todavía no está activo
-- (validado por la plataforma), todo lo que cargue queda "pendiente de
-- aceptación" — eso YA pasa hoy (confirmation_status_id arranca en
-- PENDING siempre). Lo que faltaba: cuando un operador VALIDA al
-- profesional (lo activa desde Profesionales), la plataforma tiene que
-- poder aceptar en su nombre las notas que dejó — y siempre se debe
-- poder ver si la aceptación fue del viajero o de la plataforma.
--
-- Nuevo código de confirmación PLATFORM_CONFIRMED (además de
-- MEMBER_CONFIRMED ya existente) + columnas de auditoría de "cuándo/
-- quién" del lado plataforma (member_reviewed_at ya cubre el lado
-- viajero). El disparador es un trigger, no un endpoint nuevo: activar
-- un profesional (is_active FALSE -> TRUE) desde CUALQUIER lado (el
-- CRUD genérico de Profesionales ya lo permite) cascadea solo, sin
-- que admin-web tenga que llamar a nada especial.
-- ============================================================

WITH d AS (SELECT id FROM params.domain_catalogs WHERE code = 'CONFIRMATION_STATUS')
INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, label_pt, display_order, is_system, lifecycle_status, metadata)
SELECT d.id, 'PLATFORM_CONFIRMED', 'Aceptado por la plataforma', 'Confirmed by the platform', 'Aceito pela plataforma', 4,
       TRUE, 'ACTIVE', '{"requires_action":false}'::JSONB
FROM d
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = 'PLATFORM_CONFIRMED'
);

ALTER TABLE clinical.encounter_submissions
  ADD COLUMN IF NOT EXISTS platform_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform_reviewed_by UUID;

CREATE OR REPLACE FUNCTION clinical.cascade_platform_confirmation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, clinical, params AS $$
BEGIN
  IF NEW.is_active = TRUE AND (OLD.is_active IS DISTINCT FROM TRUE) THEN
    UPDATE clinical.encounter_submissions
    SET confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS', 'PLATFORM_CONFIRMED'),
        canonical_status_id    = params.catalog_id('CANONICAL_STATUS', 'IN_CANONICAL'),
        platform_reviewed_at   = NOW(),
        platform_reviewed_by   = app.current_uuid('app.current_user_id')
    WHERE professional_id = NEW.id
      AND confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS', 'PENDING');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_platform_confirmation ON clinical.healthcare_professionals;
CREATE TRIGGER trg_cascade_platform_confirmation
  AFTER UPDATE OF is_active ON clinical.healthcare_professionals
  FOR EACH ROW EXECUTE FUNCTION clinical.cascade_platform_confirmation();
