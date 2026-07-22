-- Gap #6 (ver SCHEMA_GAPS.md): core.mfa_methods quedó sin RLS habilitada
-- en 003_core_identity.sql (a diferencia de core.security_sessions, que sí
-- tiene sessions_self) y el domain MFA_METHOD de params.domain_catalogs
-- (008_seeds.sql línea 15) nunca recibió sus catalog_values. Sin esto,
-- POST /auth/mfa/enroll no puede resolver params.catalog_id('MFA_METHOD','TOTP')
-- y, aunque resolviera, cualquier rol con el GRANT de app_runtime podría leer
-- o pisar el mfa_methods de cualquier usuario (no solo el propio).
-- No se toca el baseline 000-009 aprobado; aplicar como patch adicional.

ALTER TABLE core.mfa_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY mfa_methods_self ON core.mfa_methods
  USING (
    user_id = app.current_uuid('app.current_user_id')
  );

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, 'TOTP', 'Código de un solo uso (app autenticadora)', 'Time-based one-time code', 1, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
WHERE dc.code = 'MFA_METHOD'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv
    JOIN params.domain_catalogs dc2 ON cv.domain_id = dc2.id
    WHERE dc2.code = 'MFA_METHOD' AND cv.code = 'TOTP'
  );
