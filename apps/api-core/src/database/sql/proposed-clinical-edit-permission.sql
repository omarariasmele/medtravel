-- ============================================================
-- Pedido explícito del usuario: poder corregir/borrar (baja lógica)
-- antecedentes clínicos mal cargados desde la web — pero SOLO
-- operadores puntualmente autorizados, no cualquier operador con un
-- caso abierto (que hoy ya podría, vía clinical.has_clinical_access,
-- simplemente porque nunca se construyó una pantalla que lo usara).
-- Mismo patrón que can_manage_config/can_manage_operators — un flag
-- más en operations.operator_roles, gateado en la app (no en RLS) vía
-- createPermissionGuard('canEditClinicalData').
-- ============================================================

ALTER TABLE operations.operator_roles
  ADD COLUMN IF NOT EXISTS can_edit_clinical_data BOOLEAN NOT NULL DEFAULT FALSE;

-- Se lo otorgamos al rol de la propia usuaria (SUPERADMIN) — el mismo
-- criterio que ya tiene can_manage_config (Zona de pruebas, Catálogos,
-- Parámetros). CALL_CENTER_AGENT tiene can_access_medical (ve la
-- ficha) pero NO este permiso nuevo: puede ver, no corregir.
UPDATE operations.operator_roles
  SET can_edit_clinical_data = TRUE
  WHERE code = 'SUPERADMIN';

DROP FUNCTION IF EXISTS operations.get_operator_login_context(UUID);

CREATE FUNCTION operations.get_operator_login_context(p_user_id UUID)
RETURNS TABLE (
  operator_id UUID,
  tenant_id UUID,
  can_manage_config BOOLEAN,
  can_manage_operators BOOLEAN,
  can_close_cases BOOLEAN,
  can_access_medical BOOLEAN,
  can_edit_clinical_data BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, operations AS $$
BEGIN
  RETURN QUERY
  SELECT op.id, op.tenant_id, r.can_manage_config, r.can_manage_operators,
         r.can_close_cases, r.can_access_medical, r.can_edit_clinical_data
  FROM operations.operators op
  JOIN operations.operator_roles r ON r.id = op.role_id
  WHERE op.user_id = p_user_id;
END;
$$;

-- Fix real encontrado de paso: a las 5 tablas clínicas con borrado
-- bloqueado (allergies/conditions/medications/implants_devices) les
-- falta a "surgeries" el trigger de auditoría que las otras 4 ya
-- tienen — cualquier UPDATE/DELETE sobre cirugías quedaba sin
-- registrar quién lo hizo.
DROP TRIGGER IF EXISTS audit_surgeries ON clinical.surgeries;
CREATE TRIGGER audit_surgeries AFTER INSERT OR DELETE OR UPDATE ON clinical.surgeries
  FOR EACH ROW EXECUTE FUNCTION audit.log_event();
