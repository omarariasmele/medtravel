-- ============================================================
-- Cierre de casos de asistencia (pedido del usuario: "como se hace
-- cuando un caso de asistencia se cierra, porque no veo que eso se
-- este contemplando en el modelo actual").
--
-- El schema ya tenía las columnas para esto en operations.emergency_cases
-- (resolution_type_id, resolution_notes, resolved_at, closed_at,
-- closed_by) pero el catálogo CASE_RESOLUTION_TYPE nunca se creó, así
-- que resolution_type_id no tenía valores válidos para apuntar.
-- ============================================================

INSERT INTO params.domain_catalogs (code, name_es, name_en, description_es, allows_tenant_override, allows_custom_values, is_ordered, is_system, active)
SELECT 'CASE_RESOLUTION_TYPE', 'Tipo de resolución de caso', 'Case resolution type',
       'Cómo se resolvió un caso de asistencia al cerrarlo', FALSE, TRUE, TRUE, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM params.domain_catalogs WHERE code = 'CASE_RESOLUTION_TYPE');

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, active)
SELECT d.id, v.code, v.label_es, v.label_en, v.display_order, TRUE, TRUE
FROM params.domain_catalogs d
CROSS JOIN (VALUES
  ('PHONE_ADVICE', 'Resuelto por asesoramiento telefónico', 'Resolved by phone advice', 1),
  ('REFERRED_LOCAL_PROVIDER', 'Derivado a prestador local', 'Referred to local provider', 2),
  ('HOSPITALIZATION_ARRANGED', 'Internación gestionada', 'Hospitalization arranged', 3),
  ('TRANSPORT_ARRANGED', 'Traslado gestionado', 'Transport arranged', 4),
  ('CANCELLED_BY_MEMBER', 'Cancelado por el viajero', 'Cancelled by member', 5),
  ('CANCELLED_DUPLICATE', 'Cancelado por duplicado', 'Cancelled — duplicate', 6),
  ('ESCALATED_TO_PARTNER', 'Escalado a socio/partner', 'Escalated to partner', 7),
  ('OTHER', 'Otro', 'Other', 8)
) AS v(code, label_es, label_en, display_order)
WHERE d.code = 'CASE_RESOLUTION_TYPE'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = d.id AND cv.code = v.code
  );
