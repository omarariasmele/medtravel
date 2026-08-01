-- ============================================================
-- Obra social / prepaga como hecho independiente de la persona, no de
-- su relación con una empresa de asistencia al viajero. Pedido
-- explícito del usuario: "la obra social o prestador médico o empresa
-- prestadora de salud no tiene nada que ver con asistencia al
-- viajero" — hoy coverage.health_coverages exige member_id NOT NULL
-- (core.members, siempre tenant-scoped a una empresa de asistencia),
-- así que un viajero sin ninguna empresa asociada no podía cargar su
-- obra social. Se desacopla agregando person_id como camino
-- alternativo — member_id sigue existiendo (una fila puede tener
-- ambos si en algún momento el viajero también queda enrolled), pero
-- ya no es obligatorio.
--
-- coverage.healthcare_providers (prestador — OSDE, Swiss Medical,
-- Hospital Italiano, etc.) y coverage.healthcare_plans (el plan
-- anidado bajo un prestador — ej. OSDE 210/310) son tablas propias en
-- vez de params.domain_catalogs/catalog_values: el usuario pidió
-- explícitamente que la tabla de prestadores tenga "país y prestador
-- como campos mínimos" (country_id real, no un catálogo plano sin
-- ese campo), y que un plan cuelgue de un prestador — dos niveles de
-- jerarquía real con FK, no encajan en el catálogo plano.
--
-- Ambas tienen las mismas columnas de ciclo de vida
-- (lifecycle_status/submitted_by_person_id/approved_by/approved_at/
-- merged_into_id, mismo patrón que ya tenía params.catalog_values
-- desde el baseline aprobado pero sin ningún endpoint que lo usara)
-- para el segundo requisito del usuario: el viajero puede cargar un
-- prestador/plan que no está en la lista como texto libre, pero queda
-- "pendiente de confirmación" hasta que un operador lo revise
-- (aprobar tal cual, corregir el nombre, o fusionarlo con uno ya
-- existente si es un duplicado con otro nombre).
-- ============================================================

CREATE TABLE coverage.healthcare_providers (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- FK a params.catalog_values (dominio HEALTH_COVERAGE_TYPE, el mismo
  -- que ya usa coverage.health_coverages.coverage_type_id) — una obra
  -- social (entidad que agrupa a los trabajadores de un rubro, ej. la
  -- del personal jerárquico bancario) y una prepaga (empresa privada de
  -- medicina, ej. Swiss Medical) NO son lo mismo: distinta naturaleza,
  -- distinto padrón/código, aunque las dos cuelguen del mismo país y
  -- tengan planes propios. Reutiliza el catálogo existente en vez de
  -- crear uno nuevo — code IS NULL/NOT NULL ya no es lo que las
  -- distingue (eso solo indica si tiene o no número de registro
  -- oficial, algunas prepagas también podrían tenerlo el día de mañana).
  provider_type_id       UUID         NOT NULL REFERENCES params.catalog_values(id),
  -- FK a params.catalog_values (dominio COUNTRY, ya sembrado con 165 países).
  country_id             UUID         NOT NULL REFERENCES params.catalog_values(id),
  -- Código oficial del padrón (ej. RNOS de Argentina para obras
  -- sociales — "OSDE", "0-0020-8", "PAMI") — NULL si no tiene uno
  -- (típico en prepagas, o en un prestador cargado por un viajero a
  -- mano, ver proposed-healthcare-providers-seed.sql).
  code                   VARCHAR(30),
  name                   VARCHAR(250) NOT NULL,
  lifecycle_status       VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                         CHECK (lifecycle_status IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
  -- NULL si lo sembró el admin/seed — solo se completa cuando lo carga un viajero.
  submitted_by_person_id UUID         REFERENCES core.persons(id),
  approved_by            UUID,
  approved_at            TIMESTAMPTZ,
  -- Si un operador lo fusiona como duplicado de un prestador ya existente.
  merged_into_id         UUID         REFERENCES coverage.healthcare_providers(id),
  active                 BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_healthcare_providers_country ON coverage.healthcare_providers(country_id);
-- Único por país+código cuando el código existe (padrón oficial) — permite
-- re-correr el seed sin duplicar, no aplica a los que no tienen código.
CREATE UNIQUE INDEX idx_healthcare_providers_country_code
  ON coverage.healthcare_providers(country_id, code) WHERE code IS NOT NULL;

CREATE TABLE coverage.healthcare_plans (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id            UUID         NOT NULL REFERENCES coverage.healthcare_providers(id),
  name                   VARCHAR(150) NOT NULL,
  lifecycle_status       VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE'
                         CHECK (lifecycle_status IN ('DRAFT','APPROVED','ACTIVE','RETIRED')),
  submitted_by_person_id UUID         REFERENCES core.persons(id),
  approved_by            UUID,
  approved_at            TIMESTAMPTZ,
  merged_into_id         UUID         REFERENCES coverage.healthcare_plans(id),
  active                 BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_healthcare_plans_provider ON coverage.healthcare_plans(provider_id);

-- Sin RLS en ninguna de las dos: catálogo de referencia global, mismo
-- criterio que params.domain_catalogs/catalog_values (tampoco tienen
-- RLS propia). El alta libre queda abierta a nivel app a cualquier
-- viajero autenticado (AuthGuard('jwt') solo); aprobar/editar/fusionar
-- quedan detrás de ConfigAccessGuard, igual que el resto de
-- /params/admin/* y /coverage/admin/*.
GRANT SELECT, INSERT, UPDATE ON coverage.healthcare_providers TO app_runtime;
GRANT SELECT, INSERT, UPDATE ON coverage.healthcare_plans TO app_runtime;

-- ── Desacople de coverage.health_coverages ─────────────────────
ALTER TABLE coverage.health_coverages
  ADD COLUMN person_id       UUID REFERENCES core.persons(id),
  ADD COLUMN provider_id     UUID REFERENCES coverage.healthcare_providers(id),
  ADD COLUMN plan_id         UUID REFERENCES coverage.healthcare_plans(id),
  -- "Contratante" de la referencia del usuario (ej. la prepaga la
  -- contrata el empleador, no el propio viajero) — opcional.
  ADD COLUMN contractor_name VARCHAR(200);

ALTER TABLE coverage.health_coverages
  ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE coverage.health_coverages
  ADD CONSTRAINT health_coverages_owner_chk
  CHECK (member_id IS NOT NULL OR person_id IS NOT NULL);

-- provider_name se mantiene NOT NULL sin tocar — el backend lo
-- completa con el nombre del prestador elegido al insertar, para no
-- romper ninguna lectura existente (ej. travelers-overview) que ya
-- confía en que esa columna siempre tiene un valor legible.

-- hc_select/hc_insert/hc_update (004_coverage.sql) ganan una rama por
-- person_id directo, además de la existente vía member_id. No se toca
-- hc_no_delete: dar de baja una afiliación sigue siendo poner
-- valid_until, nunca un DELETE — ni siquiera para las filas nuevas
-- que solo tienen person_id.
ALTER POLICY hc_select ON coverage.health_coverages
  USING (
    member_id IN (SELECT id FROM core.members WHERE person_id = app.current_uuid('app.current_person_id'))
    OR person_id = app.current_uuid('app.current_person_id')
    OR (app.current_uuid('app.current_tenant_id') IS NOT NULL AND member_id IN (
        SELECT mdc.member_id FROM core.member_data_consents mdc
        JOIN params.consent_purposes cp ON mdc.purpose_id = cp.id
        JOIN core.members m ON mdc.member_id = m.id
        WHERE m.tenant_id = app.current_uuid('app.current_tenant_id')
          AND mdc.granted = TRUE AND (mdc.valid_until IS NULL OR mdc.valid_until > NOW())
          AND cp.code = 'HEALTH_COVERAGE_ACCESS'))
  );

ALTER POLICY hc_insert ON coverage.health_coverages
  WITH CHECK (
    member_id IN (SELECT id FROM core.members WHERE person_id = app.current_uuid('app.current_person_id'))
    OR person_id = app.current_uuid('app.current_person_id')
  );

ALTER POLICY hc_update ON coverage.health_coverages
  USING (
    member_id IN (SELECT id FROM core.members WHERE person_id = app.current_uuid('app.current_person_id'))
    OR person_id = app.current_uuid('app.current_person_id')
  )
  WITH CHECK (
    member_id IN (SELECT id FROM core.members WHERE person_id = app.current_uuid('app.current_person_id'))
    OR person_id = app.current_uuid('app.current_person_id')
  );
