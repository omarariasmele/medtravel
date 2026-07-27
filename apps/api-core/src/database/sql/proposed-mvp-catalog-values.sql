-- ============================================================
-- 008_seeds.sql crea los ~100 domain_catalogs (la taxonomía completa)
-- pero solo siembra catalog_values reales para un subconjunto — el
-- resto queda como "slots" vacíos a propósito (parametrización real,
-- no hardcodeada). Para el walkthrough /me/* del brief (Paso 1) hacen
-- falta valores reales en 9 dominios que hoy no tienen ninguno — sin
-- esto, ni siquiera se puede crear un viaje, una alergia, una cobertura
-- o un token de emergencia (columnas NOT NULL sin ningún valor al que
-- apuntar). Esto es carga de datos de catálogo, no un cambio de
-- arquitectura — no toca RLS, funciones, ni estructura de tablas.
-- No se toca el baseline 000-009 aprobado; aplicar como patch adicional.
-- ============================================================

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.es, v.en, v.ord, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
JOIN (VALUES
  ('ALLERGEN_TYPE', 'MEDICATION',   'Medicamento',        'Medication',    1),
  ('ALLERGEN_TYPE', 'FOOD',         'Alimento',           'Food',          2),
  ('ALLERGEN_TYPE', 'ENVIRONMENTAL','Ambiental',          'Environmental', 3),
  ('ALLERGEN_TYPE', 'OTHER',        'Otro',               'Other',         4),

  ('REACTION_SEVERITY', 'MILD',     'Leve',               'Mild',          1),
  ('REACTION_SEVERITY', 'MODERATE', 'Moderada',           'Moderate',      2),
  ('REACTION_SEVERITY', 'SEVERE',   'Severa',             'Severe',        3),
  ('REACTION_SEVERITY', 'CRITICAL', 'Crítica',            'Critical',      4),

  ('PROVENANCE_TYPE', 'SELF_DECLARED',        'Declarado por el titular',   'Self-declared',          1),
  ('PROVENANCE_TYPE', 'PROFESSIONAL_ENTERED', 'Cargado por profesional',    'Professional-entered',  2),
  ('PROVENANCE_TYPE', 'IMPORTED',             'Importado de otro sistema',  'Imported',               3),

  ('HEALTH_COVERAGE_TYPE', 'PRIVATE_INSURANCE', 'Prepaga',                 'Private insurance',  1),
  ('HEALTH_COVERAGE_TYPE', 'SOCIAL_SECURITY',   'Obra social',             'Social security',    2),
  ('HEALTH_COVERAGE_TYPE', 'TRAVEL_INSURANCE',  'Seguro de viaje',         'Travel insurance',   3),
  ('HEALTH_COVERAGE_TYPE', 'CORPORATE',         'Corporativa',             'Corporate',          4),

  ('COVERAGE_STATUS', 'ACTIVE',    'Activa',    'Active',    1),
  ('COVERAGE_STATUS', 'EXPIRED',   'Vencida',   'Expired',   2),
  ('COVERAGE_STATUS', 'SUSPENDED', 'Suspendida','Suspended', 3),
  ('COVERAGE_STATUS', 'CANCELLED', 'Cancelada', 'Cancelled', 4),

  ('TRIP_STATUS', 'PLANNED',     'Planificado', 'Planned',     1),
  ('TRIP_STATUS', 'IN_PROGRESS', 'En curso',    'In progress', 2),
  ('TRIP_STATUS', 'COMPLETED',   'Completado',  'Completed',   3),
  ('TRIP_STATUS', 'CANCELLED',   'Cancelado',   'Cancelled',   4),

  ('TOKEN_STATUS', 'ACTIVE',  'Activo',   'Active',  1),
  ('TOKEN_STATUS', 'USED',    'Usado',    'Used',    2),
  ('TOKEN_STATUS', 'EXPIRED', 'Vencido',  'Expired', 3),
  ('TOKEN_STATUS', 'REVOKED', 'Revocado', 'Revoked', 4),

  ('ASSISTANCE_PLAN_TYPE', 'BASIC',     'Básico',     'Basic',     1),
  ('ASSISTANCE_PLAN_TYPE', 'PREMIUM',   'Premium',    'Premium',   2),
  ('ASSISTANCE_PLAN_TYPE', 'CORPORATE', 'Corporativo','Corporate', 3),

  ('ENROLLMENT_STATUS', 'ACTIVE',    'Activo',    'Active',    1),
  ('ENROLLMENT_STATUS', 'PENDING',   'Pendiente', 'Pending',   2),
  ('ENROLLMENT_STATUS', 'EXPIRED',   'Vencido',   'Expired',   3),
  ('ENROLLMENT_STATUS', 'CANCELLED', 'Cancelado', 'Cancelled', 4)
) AS v(domain_code, code, es, en, ord) ON dc.code = v.domain_code
WHERE NOT EXISTS (
  SELECT 1 FROM params.catalog_values cv
  WHERE cv.domain_id = dc.id AND cv.code = v.code
);
