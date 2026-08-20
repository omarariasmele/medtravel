-- ============================================================
-- Gap #60: CASE_PARTICIPANT_TYPE solo tenía sembrado 'MEMBER' — mismo
-- patrón que BLOOD_TYPE (gap #50) y DESTINATION_STATUS (gap #53).
-- Encontrado construyendo el auto-join del operador al chat de un
-- caso (events.gateway.ts): la búsqueda de 'OPERATOR' no encontraba
-- nada y el auto-join fallaba en silencio (sin loguear error, porque
-- no era una excepción — simplemente no había fila que insertar).
-- 'EXTERNAL' se agrega de paso: case_participants.external_name/
-- external_email ya existen en el schema para justo ese caso
-- (un tercero sin cuenta, ej. un médico invitado) pero tampoco tenían
-- ningún código de catálogo utilizable.
-- ============================================================

INSERT INTO params.catalog_values (domain_id, code, label_es, label_en, display_order, is_system, lifecycle_status)
SELECT dc.id, v.code, v.label_es, v.label_en, v.display_order, TRUE, 'ACTIVE'
FROM params.domain_catalogs dc
CROSS JOIN (VALUES
  ('OPERATOR', 'Operador',   'Operator', 2),
  ('EXTERNAL', 'Externo',    'External', 3)
) AS v(code, label_es, label_en, display_order)
WHERE dc.code = 'CASE_PARTICIPANT_TYPE'
  AND NOT EXISTS (
    SELECT 1 FROM params.catalog_values cv WHERE cv.domain_id = dc.id AND cv.code = v.code
  );
