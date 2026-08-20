-- ============================================================
-- Gap #40: "Usuarios" (travelers-overview) nunca mostraba el email con
-- el que el viajero se registró — pedido explícito del usuario: sin
-- esto no hay forma de saber con qué cuenta entrar a probar la app.
-- core.users tiene RLS habilitada sin ninguna política (deny-all), así
-- que un JOIN directo desde travelers-overview.controller.ts siempre
-- devolvería NULL. Mismo criterio EXACTO que get_person_phone_for_operator
-- (gap #37) y get_person_document_for_operator (gap #38): se usa como
-- función escalar dentro del SELECT principal de TravelersOverview
-- (que sigue corriendo bajo RLS normal sobre members/persons) — nunca
-- se envuelve toda la query en SECURITY DEFINER, eso bypassearía
-- también la restricción de tenant sobre members/persons.
-- ============================================================

CREATE OR REPLACE FUNCTION core.get_person_email_for_operator(p_person_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core, app AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM core.members m
      WHERE m.person_id = p_person_id
        AND m.tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  ) THEN
    RETURN NULL;
  END IF;

  SELECT core.decrypt_pii(u.email) INTO v_email
  FROM core.users u
  WHERE u.person_id = p_person_id;

  RETURN v_email;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.get_person_email_for_operator(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.get_person_email_for_operator(UUID) TO app_runtime, test_runner;
