-- ============================================================
-- Datos de referencia + demo mínimos para poder cargar un "Plan de
-- asistencia al viajero" real desde la ficha del viajero: PLAN_TYPE no
-- existía como dominio, SPONSOR_TYPE existía vacío, y no había ningún
-- coverage.assistance_plans / coverage.coverage_sponsors cargado — sin
-- esto el formulario de alta de enrollment no tendría ninguna opción
-- para elegir. Se agrega un sponsor de ejemplo ("AXA Assistance", el
-- mismo que pidió el usuario para probar) y un plan básico, ambos
-- atados al tenant demo OYSGROUP.
-- ============================================================

INSERT INTO params.domain_catalogs (code, name_es, name_en, allows_tenant_override, allows_custom_values, is_ordered, is_system)
SELECT 'PLAN_TYPE', 'Tipo de plan de asistencia', 'Assistance plan type', TRUE, TRUE, FALSE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs WHERE code = 'PLAN_TYPE');

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system)
SELECT d.id, v.code, v.label_es, v.label_en, v.ord, TRUE
FROM params.domain_catalogs d,
  (VALUES ('BASIC','Básico','Basic',1), ('STANDARD','Estándar','Standard',2),
          ('PREMIUM','Premium','Premium',3), ('CORPORATE','Corporativo','Corporate',4)
  ) AS v(code, label_es, label_en, ord)
WHERE d.code = 'PLAN_TYPE'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.tenant_id IS NULL AND cv.code = v.code);

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system)
SELECT d.id, v.code, v.label_es, v.label_en, v.ord, TRUE
FROM params.domain_catalogs d,
  (VALUES ('INSURER','Aseguradora','Insurer',1), ('CARD_ISSUER','Emisor de tarjeta','Card issuer',2),
          ('TRAVEL_AGENCY','Agencia de viajes','Travel agency',3), ('CORPORATE','Corporativo','Corporate',4)
  ) AS v(code, label_es, label_en, ord)
WHERE d.code = 'SPONSOR_TYPE'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.tenant_id IS NULL AND cv.code = v.code);

-- Sponsor y plan de ejemplo, atados al tenant demo
INSERT INTO coverage.coverage_sponsors (tenant_id, sponsor_type_id, name, code, active)
SELECT t.id, st.id, 'AXA Assistance', 'AXA', TRUE
FROM core.tenants t, params.catalog_values st
JOIN params.domain_catalogs d ON d.id = st.domain_id AND d.code = 'SPONSOR_TYPE' AND st.code = 'INSURER'
WHERE t.code = 'DEMO95D141E1'
  AND NOT EXISTS (SELECT 1 FROM coverage.coverage_sponsors WHERE tenant_id = t.id AND code = 'AXA');

INSERT INTO coverage.assistance_plans (tenant_id, code, name, plan_type_id, max_trip_days, active)
SELECT t.id, 'PREMIUM_TRAVEL', 'Asistencia al Viajero Premium', pt.id, 365, TRUE
FROM core.tenants t, params.catalog_values pt
JOIN params.domain_catalogs d ON d.id = pt.domain_id AND d.code = 'PLAN_TYPE' AND pt.code = 'PREMIUM'
WHERE t.code = 'DEMO95D141E1'
  AND NOT EXISTS (SELECT 1 FROM coverage.assistance_plans WHERE tenant_id = t.id AND code = 'PREMIUM_TRAVEL');

-- HEALTH_COVERAGE_STATUS: dominio no existía, y coverage.health_coverages
-- lo exige NOT NULL para cualquier alta desde la ficha del viajero.
INSERT INTO params.domain_catalogs (code, name_es, name_en, allows_tenant_override, allows_custom_values, is_ordered, is_system)
SELECT 'HEALTH_COVERAGE_STATUS', 'Estado de cobertura de salud', 'Health coverage status', FALSE, TRUE, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs WHERE code = 'HEALTH_COVERAGE_STATUS');

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system)
SELECT d.id, v.code, v.label_es, v.label_en, v.ord, TRUE
FROM params.domain_catalogs d,
  (VALUES ('ACTIVE','Activo','Active',1), ('EXPIRED','Vencido','Expired',2), ('CANCELLED','Cancelado','Cancelled',3))
  AS v(code, label_es, label_en, ord)
WHERE d.code = 'HEALTH_COVERAGE_STATUS'
  AND NOT EXISTS (SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.tenant_id IS NULL AND cv.code = v.code);
