-- ============================================================
-- Bug real reportado en vivo: al compartir la ficha en portugués o
-- francés, "sexo" y "grupo sanguíneo" seguían en español — no es un
-- bug de código, la función de traducción por IA nunca toca estos dos
-- campos a propósito (son catálogos, no texto libre, ver labelFor en
-- catalog-hooks.ts), pero a params.catalog_values le faltaban
-- label_pt/label_fr para los dominios GENDER y BLOOD_TYPE — labelFor
-- cae de vuelta al español cuando faltan.
-- ============================================================

UPDATE params.catalog_values SET label_pt = 'Masculino', label_fr = 'Masculin'
  WHERE code = 'MALE' AND domain_id = (SELECT id FROM params.domain_catalogs WHERE code = 'GENDER');
UPDATE params.catalog_values SET label_pt = 'Feminino', label_fr = 'Féminin'
  WHERE code = 'FEMALE' AND domain_id = (SELECT id FROM params.domain_catalogs WHERE code = 'GENDER');
UPDATE params.catalog_values SET label_pt = 'Outro', label_fr = 'Autre'
  WHERE code = 'OTHER' AND domain_id = (SELECT id FROM params.domain_catalogs WHERE code = 'GENDER');
UPDATE params.catalog_values SET label_pt = 'Prefiro não dizer', label_fr = 'Préfère ne pas dire'
  WHERE code = 'PREFER_NOT_TO_SAY' AND domain_id = (SELECT id FROM params.domain_catalogs WHERE code = 'GENDER');

UPDATE params.catalog_values SET label_pt = 'O Negativo', label_fr = 'O Négatif'
  WHERE code = 'O_NEG' AND domain_id = (SELECT id FROM params.domain_catalogs WHERE code = 'BLOOD_TYPE');
UPDATE params.catalog_values SET label_pt = 'O Positivo', label_fr = 'O Positif'
  WHERE code = 'O_POS' AND domain_id = (SELECT id FROM params.domain_catalogs WHERE code = 'BLOOD_TYPE');
UPDATE params.catalog_values SET label_pt = 'A Negativo', label_fr = 'A Négatif'
  WHERE code = 'A_NEG' AND domain_id = (SELECT id FROM params.domain_catalogs WHERE code = 'BLOOD_TYPE');
UPDATE params.catalog_values SET label_pt = 'A Positivo', label_fr = 'A Positif'
  WHERE code = 'A_POS' AND domain_id = (SELECT id FROM params.domain_catalogs WHERE code = 'BLOOD_TYPE');
UPDATE params.catalog_values SET label_pt = 'B Negativo', label_fr = 'B Négatif'
  WHERE code = 'B_NEG' AND domain_id = (SELECT id FROM params.domain_catalogs WHERE code = 'BLOOD_TYPE');
UPDATE params.catalog_values SET label_pt = 'B Positivo', label_fr = 'B Positif'
  WHERE code = 'B_POS' AND domain_id = (SELECT id FROM params.domain_catalogs WHERE code = 'BLOOD_TYPE');
UPDATE params.catalog_values SET label_pt = 'AB Negativo', label_fr = 'AB Négatif'
  WHERE code = 'AB_NEG' AND domain_id = (SELECT id FROM params.domain_catalogs WHERE code = 'BLOOD_TYPE');
UPDATE params.catalog_values SET label_pt = 'AB Positivo', label_fr = 'AB Positif'
  WHERE code = 'AB_POS' AND domain_id = (SELECT id FROM params.domain_catalogs WHERE code = 'BLOOD_TYPE');
