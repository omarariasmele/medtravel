-- ============================================================
-- core.partner_member_records.raw_name / raw_doc_number quedaron sin
-- cifrar en el diseño original (comentario "dato del partner, sin
-- cifrar" en 003_core_identity.sql) — pero es nombre + documento de
-- identidad de una persona real, la misma clase de dato crítico que ya
-- se cifra en core.persons/external_identifiers/healthcare_professionals.
-- La tabla nunca tuvo filas reales (recién se está conectando a un
-- controller por primera vez), así que la migración es directa, sin
-- necesidad de convertir datos existentes.
--
-- raw_doc_type NO se cifra — es un código corto (ej. 'DNI', 'PASSPORT'),
-- no identifica a nadie por sí solo, mismo criterio ya usado para no
-- cifrar UUIDs/códigos de catálogo en la ronda anterior de encriptación.
-- ============================================================

ALTER TABLE core.partner_member_records ALTER COLUMN raw_name TYPE BYTEA USING NULL;
ALTER TABLE core.partner_member_records ALTER COLUMN raw_doc_number TYPE BYTEA USING NULL;
