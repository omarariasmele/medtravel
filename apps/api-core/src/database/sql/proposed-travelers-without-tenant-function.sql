-- ============================================================
-- Gap #30: /identity/travelers-without-tenant devolvía siempre 0 filas
-- para cualquier operador real (no superusuario). core.users tiene RLS
-- HABILITADA pero sin ninguna policy (003_core_identity.sql:295) — el
-- patrón establecido en todo el resto del schema es que core.users
-- SOLO se lee vía funciones SECURITY DEFINER (core.get_user_email,
-- core.get_login_credentials, etc.), nunca con un SELECT/JOIN directo.
-- El controller hacía `JOIN core.users u ON u.person_id = p.id` directo,
-- así que ese JOIN quedaba vacío sin importar el permiso canManageConfig
-- del operador (confirmado: core.current_operator_can_manage_config()
-- daba TRUE, pero el JOIN igual devolvía 0 filas).
-- ============================================================

DROP FUNCTION IF EXISTS core.get_travelers_without_tenant();

CREATE OR REPLACE FUNCTION core.get_travelers_without_tenant()
RETURNS TABLE (
  person_id          UUID,
  first_name         TEXT,
  last_name          TEXT,
  email              TEXT,
  email_verified     BOOLEAN,
  created_at         TIMESTAMPTZ,
  has_health_coverage BOOLEAN,
  doc_type_code      TEXT,
  doc_number         TEXT,
  doc_country_code   TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, coverage, params AS $$
BEGIN
  IF NOT core.current_operator_can_manage_config() THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT p.id,
         core.decrypt_pii(p.first_name),
         core.decrypt_pii(p.last_name),
         core.decrypt_pii(u.email),
         u.email_verified,
         p.created_at,
         EXISTS (
           SELECT 1 FROM coverage.health_coverages hc WHERE hc.person_id = p.id
         ),
         dt.code::TEXT,
         core.decrypt_pii(ei.doc_number),
         dc.code::TEXT
  FROM core.persons p
  JOIN core.users u ON u.person_id = p.id
  LEFT JOIN core.external_identifiers ei ON ei.person_id = p.id AND ei.is_primary = TRUE
  LEFT JOIN params.catalog_values dt ON dt.id = ei.doc_type_id
  LEFT JOIN params.catalog_values dc ON dc.id = ei.issuing_country_id
  WHERE NOT EXISTS (SELECT 1 FROM core.members m WHERE m.person_id = p.id)
  ORDER BY p.created_at DESC
  LIMIT 500;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.get_travelers_without_tenant() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.get_travelers_without_tenant()
  TO app_runtime, test_runner;
