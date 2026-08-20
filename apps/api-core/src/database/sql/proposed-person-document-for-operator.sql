-- ============================================================
-- Gap #38: la ficha del viajero (traveler-detail.page.tsx) nunca
-- mostraba tipo/número/país de documento — dato obligatorio desde el
-- registro (gap #32) pero invisible para el operador porque
-- core.external_identifiers está explícitamente excluida del CRUD
-- genérico (campos cifrados + blind-index, ver identity.registry.ts) y
-- nunca tuvo ningún endpoint de lectura puntual (a diferencia de la
-- lista de "usuarios sin cobertura", que sí lo expone vía
-- core.get_travelers_without_tenant()).
--
-- external_identifiers NO tiene RLS habilitada (relrowsecurity=false) —
-- el control de acceso real tiene que estar en esta función, no
-- delegado a ninguna policy. Mismo criterio EXACTO que
-- get_person_phone_for_operator (gap #37) y persons_tenant_member_select
-- (gap #13): operador del tenant del viajero, o superadmin.
-- ============================================================

CREATE OR REPLACE FUNCTION core.get_person_document_for_operator(p_person_id UUID)
RETURNS TABLE (
  doc_type_id     UUID,
  doc_number      TEXT,
  doc_country_id  UUID
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, app AS $$
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM core.members m
      WHERE m.person_id = p_person_id
        AND m.tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ei.doc_type_id, core.decrypt_pii(ei.doc_number), ei.issuing_country_id
  FROM core.external_identifiers ei
  WHERE ei.person_id = p_person_id AND ei.is_primary = TRUE
  LIMIT 1;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.get_person_document_for_operator(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.get_person_document_for_operator(UUID) TO app_runtime, test_runner;
