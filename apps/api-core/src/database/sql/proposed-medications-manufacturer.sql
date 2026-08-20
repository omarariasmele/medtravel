-- ============================================================
-- Gap #29: clinical.medications no tenía forma de registrar el
-- laboratorio/fabricante del medicamento — solo droga (generic_name) y
-- marca comercial (brand_name). dose_amount/dose_unit_id ya existían
-- en el baseline pero ninguna vía de carga (form manual ni IA) los usaba.
--
-- B6 (proposed-clinical-encryption.sql, no en el 005_clinical.sql
-- original que se lee como referencia) ya había convertido
-- generic_name/brand_name/notes/etc. de TEXT a BYTEA cifrado — este
-- archivo se escribió mirando el schema base desactualizado y agregó
-- manufacturer como TEXT plano, columna que core.decrypt_pii(bytea)
-- no puede leer ("no existe la función core.decrypt_pii(text)"),
-- rompiendo GET /clinical/medications entero (web y mobile, mismo
-- endpoint) apenas había una fila con manufacturer no nulo.
-- ============================================================

ALTER TABLE clinical.medications
  ADD COLUMN manufacturer BYTEA;
