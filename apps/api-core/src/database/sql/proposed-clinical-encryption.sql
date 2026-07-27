-- ============================================================
-- Encriptación a nivel de columna para texto libre sensible — pedido
-- explícito del usuario: "si alguien roba la base de datos no debería
-- poder visualizar el nombre ni los datos de un usuario viajero".
--
-- Reutiliza el mecanismo ya aprobado y en producción para
-- core.users.email: core.encrypt_pii(TEXT) → BYTEA / core.decrypt_pii(
-- BYTEA) → TEXT (000_extensions.sql, pgcrypto pgp_sym_encrypt/decrypt),
-- con la clave puesta a nivel de conexión (typeorm.config.ts, GUC
-- app.encryption_key). No es un mecanismo nuevo ni una clave nueva.
--
-- Alcance (confirmado con el usuario): solo texto libre que identifica
-- a una persona — nombre, notas, medicamentos. Los UUID de catálogo
-- (severidad, tipo, estado) y los valores numéricos de laboratorio/
-- signos vitales quedan sin encriptar a propósito: no identifican a
-- nadie por sí solos, y en lab_results/vitals_history encriptarlos
-- rompería el filtrado/indexado por valor que el propio schema pide
-- (ver comentario de lab-result.entity.ts).
--
-- core.persons y clinical.allergies tienen filas reales hoy (4 y 1
-- respectivamente) — se migran sin pérdida de datos (agregar columna
-- bytea, poblarla encriptada, borrar la vieja, renombrar). El resto de
-- las tablas clínicas están vacías — alcanza con un ALTER COLUMN TYPE
-- directo, instantáneo y sin riesgo.
-- ============================================================

-- ── core.persons (4 filas: viajero demo, 2 operadores, 1 profesional) ──
ALTER TABLE core.persons
  ADD COLUMN first_name_enc bytea,
  ADD COLUMN last_name_enc  bytea;

UPDATE core.persons SET
  first_name_enc = core.encrypt_pii(first_name),
  last_name_enc  = core.encrypt_pii(last_name);

ALTER TABLE core.persons
  ALTER COLUMN first_name_enc SET NOT NULL,
  ALTER COLUMN last_name_enc  SET NOT NULL;

ALTER TABLE core.persons
  DROP COLUMN first_name,
  DROP COLUMN last_name;

ALTER TABLE core.persons RENAME COLUMN first_name_enc TO first_name;
ALTER TABLE core.persons RENAME COLUMN last_name_enc  TO last_name;

-- ── clinical.allergies (1 fila) ──
ALTER TABLE clinical.allergies
  ADD COLUMN allergen_name_enc          bytea,
  ADD COLUMN member_challenge_notes_enc bytea,
  ADD COLUMN notes_enc                  bytea;

UPDATE clinical.allergies SET
  allergen_name_enc          = core.encrypt_pii(allergen_name),
  member_challenge_notes_enc = core.encrypt_pii(member_challenge_notes),
  notes_enc                  = core.encrypt_pii(notes);

ALTER TABLE clinical.allergies
  ALTER COLUMN allergen_name_enc SET NOT NULL;

ALTER TABLE clinical.allergies
  DROP COLUMN allergen_name,
  DROP COLUMN member_challenge_notes,
  DROP COLUMN notes;

ALTER TABLE clinical.allergies RENAME COLUMN allergen_name_enc          TO allergen_name;
ALTER TABLE clinical.allergies RENAME COLUMN member_challenge_notes_enc TO member_challenge_notes;
ALTER TABLE clinical.allergies RENAME COLUMN notes_enc                 TO notes;

-- ── Resto de tablas clínicas: 0 filas hoy, ALTER directo ──

ALTER TABLE clinical.conditions
  ALTER COLUMN condition_name        TYPE bytea USING condition_name::bytea,
  ALTER COLUMN condition_name_en     TYPE bytea USING condition_name_en::bytea,
  ALTER COLUMN treating_doctor       TYPE bytea USING treating_doctor::bytea,
  ALTER COLUMN treatment_notes       TYPE bytea USING treatment_notes::bytea,
  ALTER COLUMN travel_restrictions   TYPE bytea USING travel_restrictions::bytea,
  ALTER COLUMN member_challenge_notes TYPE bytea USING member_challenge_notes::bytea,
  ALTER COLUMN notes                 TYPE bytea USING notes::bytea;

ALTER TABLE clinical.medications
  ALTER COLUMN generic_name          TYPE bytea USING generic_name::bytea,
  ALTER COLUMN brand_name            TYPE bytea USING brand_name::bytea,
  ALTER COLUMN prescribed_by         TYPE bytea USING prescribed_by::bytea,
  ALTER COLUMN travel_notes          TYPE bytea USING travel_notes::bytea,
  ALTER COLUMN member_challenge_notes TYPE bytea USING member_challenge_notes::bytea,
  ALTER COLUMN notes                 TYPE bytea USING notes::bytea;

ALTER TABLE clinical.surgeries
  ALTER COLUMN procedure_name        TYPE bytea USING procedure_name::bytea,
  ALTER COLUMN procedure_name_en     TYPE bytea USING procedure_name_en::bytea,
  ALTER COLUMN indication            TYPE bytea USING indication::bytea,
  ALTER COLUMN hospital_name         TYPE bytea USING hospital_name::bytea,
  ALTER COLUMN surgeon_name          TYPE bytea USING surgeon_name::bytea,
  ALTER COLUMN complications         TYPE bytea USING complications::bytea,
  ALTER COLUMN recovery_notes        TYPE bytea USING recovery_notes::bytea,
  ALTER COLUMN implant_details       TYPE bytea USING implant_details::bytea,
  ALTER COLUMN member_challenge_notes TYPE bytea USING member_challenge_notes::bytea,
  ALTER COLUMN notes                 TYPE bytea USING notes::bytea;

ALTER TABLE clinical.lab_results
  ALTER COLUMN lab_name       TYPE bytea USING lab_name::bytea,
  ALTER COLUMN requested_by   TYPE bytea USING requested_by::bytea,
  ALTER COLUMN ai_summary_es  TYPE bytea USING ai_summary_es::bytea,
  ALTER COLUMN ai_summary_en  TYPE bytea USING ai_summary_en::bytea;

ALTER TABLE clinical.vitals_history
  ALTER COLUMN device_used TYPE bytea USING device_used::bytea,
  ALTER COLUMN notes       TYPE bytea USING notes::bytea;

ALTER TABLE clinical.vaccines
  ALTER COLUMN vaccine_name       TYPE bytea USING vaccine_name::bytea,
  ALTER COLUMN vaccine_name_en    TYPE bytea USING vaccine_name_en::bytea,
  ALTER COLUMN manufacturer       TYPE bytea USING manufacturer::bytea,
  ALTER COLUMN batch_number       TYPE bytea USING batch_number::bytea,
  ALTER COLUMN administered_by    TYPE bytea USING administered_by::bytea,
  ALTER COLUMN institution        TYPE bytea USING institution::bytea,
  ALTER COLUMN certificate_number TYPE bytea USING certificate_number::bytea;

ALTER TABLE clinical.documents
  ALTER COLUMN file_name_original    TYPE bytea USING file_name_original::bytea,
  ALTER COLUMN title                 TYPE bytea USING title::bytea,
  ALTER COLUMN description           TYPE bytea USING description::bytea,
  ALTER COLUMN issuing_doctor        TYPE bytea USING issuing_doctor::bytea,
  ALTER COLUMN issuing_institution   TYPE bytea USING issuing_institution::bytea;

-- Nota: los ALTER de arriba sobre tablas vacías reinterpretan bytes
-- crudos (no hay filas, así que no hay dato real que "reinterpretar"
-- incorrectamente) — a partir de acá, toda la app (RlsCrudService con
-- encryptedFields, me-profile/me-clinical/events.gateway,
-- register_person_and_user, anonymize_field) escribe y lee estas
-- columnas exclusivamente vía core.encrypt_pii()/decrypt_pii().
