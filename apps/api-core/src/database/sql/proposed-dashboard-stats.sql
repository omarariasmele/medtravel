-- ============================================================
-- Indicadores del dashboard: cantidad de viajeros activos, viajes y
-- casos de asistencia ABIERTOS, por empresa (tenant). SECURITY DEFINER
-- porque necesita agregar across tenants para el superadmin (canManageConfig)
-- — un superadmin ve la fila de cada empresa, un operador normal solo
-- ve la suya (el controller le pasa su propio tenant_id, nunca NULL).
-- Son solo conteos agregados, nunca datos individuales de un viajero
-- — no expone nada que rompa el "Consent First" del brief.
-- ============================================================

-- is_platform_tenant agregado (proposed-platform-tenant-and-config-
-- bypass.sql) para que el dashboard pueda separar OYSGROUP (la
-- administradora de la plataforma) de las empresas de asistencia al
-- viajero reales. Cambia el shape de retorno, así que hace falta un
-- DROP antes de este CREATE (ver comentario en el patch de aplicación).
DROP FUNCTION IF EXISTS operations.get_tenant_dashboard_stats(UUID);

CREATE OR REPLACE FUNCTION operations.get_tenant_dashboard_stats(p_tenant_id UUID DEFAULT NULL)
RETURNS TABLE (
  tenant_id UUID,
  tenant_name TEXT,
  is_platform_tenant BOOLEAN,
  traveler_count BIGINT,
  trip_count BIGINT,
  open_case_count BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, operations, params AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name::TEXT,
    t.is_platform_tenant,
    (SELECT count(*) FROM core.members m
       WHERE m.tenant_id = t.id
         AND m.status_id = params.catalog_id('MEMBER_STATUS', 'ACTIVE')),
    (SELECT count(*) FROM operations.trips tr
       JOIN core.members m2 ON m2.id = tr.member_id
       WHERE m2.tenant_id = t.id),
    (SELECT count(*) FROM operations.emergency_cases ec
       WHERE ec.tenant_id = t.id
         AND ec.status_id NOT IN (
           SELECT id FROM params.catalog_values WHERE code IN ('CLOSED', 'CANCELLED')
         ))
  FROM core.tenants t
  WHERE p_tenant_id IS NULL OR t.id = p_tenant_id
  ORDER BY t.is_platform_tenant DESC, t.name;
END;
$$;
REVOKE EXECUTE ON FUNCTION operations.get_tenant_dashboard_stats(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION operations.get_tenant_dashboard_stats(UUID)
  TO app_runtime, test_runner;
