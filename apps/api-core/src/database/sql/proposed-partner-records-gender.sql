-- ============================================================
-- Gap real encontrado por el usuario: al ver las pólizas cargadas por
-- la empresa no se mostraba el número de documento (solo el tipo), y
-- no había forma de distinguir a dos personas que compartan número de
-- documento (distinto sexo/persona). raw_doc_type ya es un código
-- crudo del partner sin FK (VARCHAR, no catalog_values.id) — raw_gender
-- sigue exactamente el mismo patrón, por consistencia.
-- ============================================================

ALTER TABLE core.partner_member_records
  ADD COLUMN raw_gender VARCHAR(50);  -- código del dominio GENDER (MALE/FEMALE/...), dato crudo del partner
