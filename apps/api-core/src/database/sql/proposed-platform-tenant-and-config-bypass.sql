-- ============================================================
-- Corrección de modelo: OYSGROUP es la empresa administradora de la
-- PLATAFORMA, no una empresa de asistencia al viajero más — hoy
-- core.tenants no tiene forma de distinguir esto (es solo una fila más
-- en la tabla). Se agrega is_platform_tenant para poder:
--   1. Separar visualmente OYSGROUP del listado de "empresas de
--      asistencia al viajero" (dashboard).
--   2. Confirmar que solo el tenant de plataforma tiene superusuarios
--      con can_manage_config (los datos reales ya son así, esto solo
--      lo hace explícito en el modelo).
--
-- Además, el usuario pidió que OYSGROUP (canManageConfig) pueda ver Y
-- FILTRAR por empresa en Viajes, Usuarios/viajeros y Casos de
-- asistencia — hoy esas 3 tablas solo tienen acceso propio-tenant (sin
-- bypass), a diferencia de core.tenants/operations.operators que ya lo
-- tienen (ver proposed-tenants-rls.sql, proposed-tenant-access-model.sql).
-- Mismo patrón: reutiliza core.current_operator_can_manage_config()
-- (ya existe), no se crea nada nuevo.
--
-- coverage.health_coverages (pantalla "Coberturas") queda SIN bypass a
-- propósito — decisión explícita del usuario: ese dato es seguro
-- médico/obra social personal y sigue exigiendo consentimiento del
-- titular incluso para OYSGROUP, el filtro por empresa ahí solo acota
-- sobre lo que YA es visible (nunca más).
-- ============================================================

ALTER TABLE core.tenants ADD COLUMN IF NOT EXISTS is_platform_tenant BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE core.tenants SET is_platform_tenant = TRUE WHERE code = 'DEMO95D141E1';

-- core.members: members_tenant_or_self (003_core_identity.sql)
ALTER POLICY members_tenant_or_self ON core.members
  USING (
    tenant_id = app.current_uuid('app.current_tenant_id')
    OR person_id = app.current_uuid('app.current_person_id')
    OR core.current_operator_can_manage_config()
  );

-- operations.emergency_cases: cases_access (007_operations.sql)
ALTER POLICY cases_access ON operations.emergency_cases
  USING (
    tenant_id = app.current_uuid('app.current_tenant_id')
    OR member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    OR core.current_operator_can_manage_config()
  );

-- operations.trips: trips_access (proposed-trips-rls.sql)
ALTER POLICY trips_access ON operations.trips
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
         OR tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  );

-- coverage.travel_assistance_enrollments: enrollments_access (004_coverage.sql)
ALTER POLICY enrollments_access ON coverage.travel_assistance_enrollments
  USING (
    tenant_id = app.current_uuid('app.current_tenant_id')
    OR member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
    )
    OR core.current_operator_can_manage_config()
  );
