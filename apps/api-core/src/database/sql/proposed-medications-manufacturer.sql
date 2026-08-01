-- ============================================================
-- Gap #29: clinical.medications no tenía forma de registrar el
-- laboratorio/fabricante del medicamento — solo droga (generic_name) y
-- marca comercial (brand_name). dose_amount/dose_unit_id ya existían
-- en el baseline pero ninguna vía de carga (form manual ni IA) los usaba.
-- ============================================================

ALTER TABLE clinical.medications
  ADD COLUMN manufacturer TEXT;
