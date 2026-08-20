-- ============================================================
-- Bug real reportado en vivo: operations.trip_destinations solo
-- tenía GRANT SELECT, INSERT, UPDATE (007_operations.sql) — nunca
-- DELETE. Al agregar soporte de varios destinos por viaje
-- (me-trips.controller.ts::replaceDestinations, que borra los
-- destinos viejos del viaje antes de insertar la lista nueva), el
-- DELETE fallaba con "permiso denegado a la tabla trip_destinations".
-- No es dato clínico protegido (a diferencia de clinical.* — ver
-- políticas *_no_delete ahí) — es logística del viaje (adónde va),
-- sin motivo de retención/auditoría establecido en este sistema.
-- ============================================================

GRANT DELETE ON operations.trip_destinations TO app_runtime;
