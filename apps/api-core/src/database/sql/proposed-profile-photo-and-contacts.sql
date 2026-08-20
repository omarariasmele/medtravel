-- ============================================================
-- Gap #37: foto de perfil + teléfono + hasta 3 contactos de emergencia
-- para el viajero (pedido explícito del usuario: "credencial del
-- viajero" con foto + prestador, y hasta 10 teléfonos/mails útiles —
-- este patch cubre la base de foto/teléfono/contactos; el resto del
-- plan de "teléfonos útiles" queda para un patch aparte).
--
-- Tres piezas nuevas, ninguna toca el baseline 000-009:
-- 1. core.persons.photo_path — nullable, nombre de archivo relativo
--    (no ruta absoluta de disco). persons_self_access ya cubre
--    SELECT/UPDATE del propio titular, sin cambios de RLS.
-- 2. core.member_contacts desacoplada de member_id (mismo patrón que
--    coverage.health_coverages, gap #27): un viajero sin core.members
--    (sin cobertura, gap #30/#32/#35) también puede cargar sus propios
--    contactos de emergencia.
-- 3. Seed de RELATIONSHIP_TYPE (declarado en 008_seeds.sql, 0 valores
--    hasta ahora) — sin esto es imposible insertar ningún contacto,
--    ni siquiera por member_id.
-- ============================================================

ALTER TABLE core.persons ADD COLUMN photo_path TEXT;

ALTER TABLE core.member_contacts
  ADD COLUMN person_id UUID REFERENCES core.persons(id);

ALTER TABLE core.member_contacts
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE core.member_contacts
  ADD CONSTRAINT member_contacts_owner_chk CHECK (member_id IS NOT NULL OR person_id IS NOT NULL);

-- Reemplaza contacts_member_access agregando el camino directo por
-- person_id — mismo criterio que ya usa members_tenant_or_self.
-- También agrega el camino "operador del tenant del viajero, aunque el
-- contacto se haya cargado por person_id" (gap #13/persons_tenant_
-- member_select: mismo criterio, esto es admin-web mostrando los
-- contactos del propio member de su tenant) + el bypass de superadmin
-- ya usado en el resto de las tablas raíz.
DROP POLICY IF EXISTS contacts_member_access ON core.member_contacts;
CREATE POLICY contacts_member_access ON core.member_contacts
  USING (
    member_id IN (
      SELECT id FROM core.members
      WHERE person_id = app.current_uuid('app.current_person_id')
        OR tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR person_id = app.current_uuid('app.current_person_id')
    OR person_id IN (
      SELECT person_id FROM core.members
      WHERE tenant_id = app.current_uuid('app.current_tenant_id')
    )
    OR core.current_operator_can_manage_config()
  );

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
JOIN (VALUES
  ('RELATIONSHIP_TYPE', 'AMIGO',  'Amigo',  'Friend (m)',       1),
  ('RELATIONSHIP_TYPE', 'AMIGA',  'Amiga',  'Friend (f)',       2),
  ('RELATIONSHIP_TYPE', 'NIETO',  'Nieto',  'Grandson',         3),
  ('RELATIONSHIP_TYPE', 'NIETA',  'Nieta',  'Granddaughter',    4),
  ('RELATIONSHIP_TYPE', 'HIJO',   'Hijo',   'Son',              5),
  ('RELATIONSHIP_TYPE', 'HIJA',   'Hija',   'Daughter',         6),
  ('RELATIONSHIP_TYPE', 'PADRE',   'Padre',    'Father',        7),
  ('RELATIONSHIP_TYPE', 'MADRE',   'Madre',    'Mother',        8),
  ('RELATIONSHIP_TYPE', 'CONYUGE', 'Cónyuge',  'Spouse',        9),
  ('RELATIONSHIP_TYPE', 'OTRO',    'Otro',     'Other',         10)
) AS v(domain_code, code, es, en, ord) ON dc.code = v.domain_code
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = dc.id AND cv.code = v.code
);

-- ── Teléfono del viajero: core.users.phone ya existe desde el
-- baseline (BYTEA + blind_index + verified) pero nunca se expuso por
-- ningún endpoint — core.users tiene RLS forzada sin ninguna política
-- (fail-secure), así que necesita el mismo puente SECURITY DEFINER que
-- ya usa el cambio de email de operador (proposed-operator-account-
-- email.sql: get_user_email/update_user_email). phone_verified se
-- resetea a FALSE cada vez que cambia el número — pedido explícito del
-- usuario: la verificación real (WhatsApp/SMS) queda para un patch
-- futuro, esto solo deja el campo listo.
CREATE OR REPLACE FUNCTION core.get_user_phone(p_user_id UUID)
RETURNS TABLE (phone TEXT, phone_verified BOOLEAN)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
BEGIN
  RETURN QUERY
  SELECT core.decrypt_pii(u.phone), u.phone_verified
  FROM core.users u
  WHERE u.id = p_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.get_user_phone(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.get_user_phone(UUID) TO app_runtime, test_runner;

CREATE OR REPLACE FUNCTION core.update_user_phone(p_user_id UUID, p_phone TEXT, p_phone_idx TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, core AS $$
BEGIN
  UPDATE core.users
  SET phone = core.encrypt_pii(p_phone),
      phone_blind_index = p_phone_idx,
      phone_verified = FALSE
  WHERE id = p_user_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.update_user_phone(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.update_user_phone(UUID, TEXT, TEXT) TO app_runtime, test_runner;

-- ── Teléfono para admin-web: mismo criterio de acceso EXACTO que
-- persons_tenant_member_select (gap #13) — el operador solo lo ve si ya
-- podría leer esa persona por RLS normal (member de su tenant, o
-- superadmin). No es una relajación nueva, es el mismo permiso que ya
-- tiene para nombre/apellido, extendido al teléfono (que vive en
-- core.users, sin ninguna política propia).
CREATE OR REPLACE FUNCTION core.get_person_phone_for_operator(p_person_id UUID)
RETURNS TABLE (phone TEXT, phone_verified BOOLEAN)
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
  SELECT core.decrypt_pii(u.phone), u.phone_verified
  FROM core.users u
  WHERE u.person_id = p_person_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION core.get_person_phone_for_operator(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION core.get_person_phone_for_operator(UUID) TO app_runtime, test_runner;

-- ── emergency.get_shared_contacts(): incluir también los contactos
-- cargados por person_id directo, no solo los que llegan vía member_id ──
--
-- Bug real reportado en vivo (misma familia que la severidad de alergias
-- más abajo): esta función devolvía relationship_code (el CODE del
-- catálogo, ej. 'SPOUSE') y la ficha del médico lo mostraba tal cual, en
-- inglés, en vez de traducirlo. Se agrega relationship_type_id para que
-- el frontend resuelva el label con el catálogo RELATIONSHIP_TYPE (mismo
-- patrón que ya usa para género/grupo sanguíneo en esta misma vista).
-- DROP primero: cambia el RETURNS TABLE.
DROP FUNCTION IF EXISTS emergency.get_shared_contacts(UUID);
CREATE FUNCTION emergency.get_shared_contacts(p_person_id UUID)
RETURNS TABLE (
  first_name TEXT,
  last_name  TEXT,
  phone      TEXT,
  relationship_code TEXT,
  relationship_type_id UUID
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, emergency, clinical, core, params AS $$
BEGIN
  IF NOT clinical.has_clinical_access(p_person_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT mc.first_name, mc.last_name,
         core.decrypt_pii(mc.phone),
         rt.code::TEXT,
         rt.id
  FROM core.member_contacts mc
  LEFT JOIN core.members m ON m.id = mc.member_id
  LEFT JOIN params.catalog_values rt ON rt.id = mc.relationship_type_id
  WHERE (m.person_id = p_person_id OR mc.person_id = p_person_id)
    AND mc.is_emergency_contact = TRUE
    AND mc.active = TRUE
  ORDER BY mc.contact_priority;
END;
$$;
REVOKE EXECUTE ON FUNCTION emergency.get_shared_contacts(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION emergency.get_shared_contacts(UUID) TO app_runtime, test_runner;

-- ── clinical.get_patient_summary(): propagar photo_path a las dos
-- vistas que ya la usan (PatientSummaryController y buildSharedProfile,
-- share interno + QR público) sin tocar ningún caller. DROP primero:
-- Postgres no permite CREATE OR REPLACE cuando cambia el RETURNS TABLE ──
DROP FUNCTION IF EXISTS clinical.get_patient_summary(UUID);
CREATE OR REPLACE FUNCTION clinical.get_patient_summary(p_person_id UUID)
RETURNS TABLE (
  first_name           TEXT,
  last_name            TEXT,
  birth_date           DATE,
  gender_id            UUID,
  country_residence_id UUID,
  photo_path            TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, clinical, core AS $$
BEGIN
  IF NOT clinical.has_clinical_access(p_person_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    core.decrypt_pii(p.first_name),
    core.decrypt_pii(p.last_name),
    p.birth_date,
    p.gender_id,
    p.country_residence_id,
    p.photo_path
  FROM core.persons p
  WHERE p.id = p_person_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION clinical.get_patient_summary(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION clinical.get_patient_summary(UUID)
  TO app_runtime, test_runner;
