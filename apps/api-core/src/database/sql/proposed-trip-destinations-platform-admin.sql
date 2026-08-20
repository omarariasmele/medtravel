-- ============================================================
-- Gap #58: trip_destinations_access (proposed-trips-rls.sql) nunca
-- tuvo el bypass de administrador de plataforma que sí se agregó a su
-- tabla hermana trips (trips_access, proposed-platform-tenant-and-
-- config-bypass.sql) — se quedó afuera cuando se hizo ese rollout.
--
-- Efecto real (reportado por el usuario, caso MT-2026-08-000011): el
-- nuevo endpoint GET /operations/emergency-cases/:id/location (gap
-- #53) hace LEFT JOIN a trip_destinations para traer país/ciudad — un
-- operador de OYSGROUP viendo un caso de AXA (vía el bypass de
-- cases_access) obtenía el JOIN vacío en silencio (LEFT JOIN, no un
-- error) porque RLS le bloqueaba la fila de trip_destinations aunque
-- SÍ tuviera acceso al caso — la sección "Ubicación" mostraba "—" pese
-- a que el viajero sí había cargado país/ciudad a mano.
-- ============================================================

ALTER POLICY trip_destinations_access ON operations.trip_destinations
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
         OR tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  );
