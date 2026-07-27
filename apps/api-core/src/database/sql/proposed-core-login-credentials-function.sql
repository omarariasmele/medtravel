-- ============================================================
-- PROPUESTA — NO forma parte del schema SQL v1.2.3 aprobado.
--
-- core.users tiene RLS habilitada y forzada (003_core_identity.sql) pero
-- SIN ninguna política SELECT — por diseño (fail-secure), ninguna fila es
-- visible vía app_runtime. Eso bloquea el único caso de uso que
-- necesita leer core.users SIN tener aún un app.current_user_id de
-- sesión: el propio login.
--
-- Esta función resuelve ese caso puntual con el mismo patrón ya usado en
-- el schema aprobado para casos análogos (clinical.has_clinical_access,
-- audit.request_break_glass): SECURITY DEFINER, dueña de un rol que
-- bypassea RLS, con EXECUTE revocado de PUBLIC y otorgado solo a
-- app_runtime. No expone más columnas que las estrictamente necesarias
-- para autenticar (nunca doc_number, phone, etc.).
--
-- Hay que llevar esto a revisión para que se sume a la próxima versión
-- del schema aprobado (v1.2.4) — no queda pegado silenciosamente acá.
-- ============================================================

CREATE OR REPLACE FUNCTION core.get_login_credentials(p_email_blind_index TEXT)
RETURNS TABLE (
  user_id         UUID,
  person_id       UUID,
  active          BOOLEAN,
  password_hash   TEXT,
  must_change     BOOLEAN,
  failed_attempts SMALLINT,
  locked_until    TIMESTAMPTZ
) LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
BEGIN
  RETURN QUERY
  SELECT
    u.id,
    u.person_id,
    u.active,
    ac.password_hash,
    ac.must_change,
    ac.failed_attempts,
    ac.locked_until
  FROM core.users u
  JOIN core.authentication_credentials ac ON ac.user_id = u.id
  WHERE u.email_blind_index = p_email_blind_index;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.get_login_credentials(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION core.get_login_credentials(TEXT) TO app_runtime;

-- Contrapartida simétrica para failed_attempts/locked_until: estas dos
-- columnas viven en core.authentication_credentials, que NO tiene RLS
-- (a diferencia de core.users) y ya tiene GRANT SELECT/INSERT/UPDATE a
-- app_runtime (003_core_identity.sql) — no hace falta otra función para
-- actualizarlas, un UPDATE normal alcanza.
