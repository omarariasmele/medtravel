-- ============================================================
-- Bug real reportado en vivo: un médico dado de alta por
-- clinical.professionals-registration (Ignacio Martínez) aparecía en
-- "Viajeros sin cobertura" — esa lista solo excluía personas con
-- core.members, pero nunca contempló que un profesional TAMBIÉN es
-- solo un core.persons/core.users sin core.members (no es viajero de
-- ninguna empresa). Se excluye explícitamente a quien ya tiene fila en
-- clinical.healthcare_professionals.
-- ============================================================

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
SET search_path = pg_catalog, core, coverage, clinical, params AS $$
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
    AND NOT EXISTS (SELECT 1 FROM clinical.healthcare_professionals hp WHERE hp.user_id = u.id)
  ORDER BY p.created_at DESC
  LIMIT 500;
END;
$$;
