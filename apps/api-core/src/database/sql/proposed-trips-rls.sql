-- Gap #7 (ver SCHEMA_GAPS.md): operations.trips y operations.trip_destinations
-- nunca recibieron RLS en 007_operations.sql — a diferencia de
-- operations.emergency_cases (cases_access) y
-- coverage.travel_assistance_enrollments (enrollments_access), que sí la
-- tienen y comparten el mismo modelo de dueño (member_id -> core.members).
-- Sin esto, /operations/trips y /operations/trip-destinations (CRUD
-- genérico) exponían los viajes de CUALQUIER member a cualquier usuario
-- autenticado. Mismo patrón que enrollments_access/health_coverages_access.
-- No se toca el baseline 000-009 aprobado; aplicar como patch adicional.

ALTER TABLE operations.trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY trips_access ON operations.trips
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
         OR tenant_id = app.current_uuid('app.current_tenant_id')
    )
  );

ALTER TABLE operations.trip_destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY trip_destinations_access ON operations.trip_destinations
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
         OR tenant_id = app.current_uuid('app.current_tenant_id')
    )
  );
