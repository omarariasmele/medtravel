-- ============================================================
-- NO forma parte del schema SQL v1.2.3 aprobado — es un script auxiliar
-- solo para desarrollo local, ejecutado a mano después de la migración
-- InitialSchemaV123 (ver README). Crea el rol LOGIN que la app usa para
-- conectarse, dado que app_runtime/audit_writer/etc. son NOLOGIN
-- (000_extensions.sql). En SRV-2/staging/prod este rol y su password los
-- gestiona infraestructura, no esta migración.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medtravel_app') THEN
    CREATE ROLE medtravel_app LOGIN PASSWORD 'change-me';
  END IF;
END;
$$;

GRANT app_runtime TO medtravel_app;
GRANT audit_writer TO medtravel_app;
