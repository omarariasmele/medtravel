-- ============================================================
-- Pedido explícito del usuario: al cargar un viaje, poder consultar
-- (con un botón) aspectos de salud y seguridad del destino —
-- vacunación, riesgos sanitarios, alertas de seguridad, tips
-- generales. Mix pedido: tabla curada como base (rápida, gratis,
-- siempre disponible) + IA con búsqueda web para completar/actualizar
-- países que falten o estén desactualizados (ver AIService en
-- ai.service.ts, método de refresco vía web_search de OpenAI).
--
-- No es RLS: es contenido de referencia global por país, no dato de
-- un viajero puntual (mismo criterio que ai.interview_questions /
-- ai.knowledge_base_entries) — administrado desde admin-web.
-- ============================================================

CREATE TABLE IF NOT EXISTS ai.destination_health_info (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_id       UUID NOT NULL UNIQUE REFERENCES params.catalog_values(id),
  vaccinations     TEXT,
  health_risks     TEXT,
  security_alerts  TEXT,
  general_tips     TEXT,
  source           VARCHAR(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'ai_web_search')),
  source_notes     TEXT,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_destination_health_info_upd
  BEFORE UPDATE ON ai.destination_health_info
  FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();

GRANT SELECT, INSERT, UPDATE ON ai.destination_health_info TO app_runtime;

-- ------------------------------------------------------------
-- Semillas manuales: destinos frecuentes para viajeros argentinos.
-- Contenido general y conservador (no exhaustivo/no reemplaza fuentes
-- oficiales) — pensado como punto de partida, el botón "Actualizar con
-- IA" en admin-web lo refresca vía web_search cuando haga falta.
-- ------------------------------------------------------------
INSERT INTO ai.destination_health_info (country_id, vaccinations, health_risks, security_alerts, general_tips, source)
SELECT cv.id, seed.vaccinations, seed.health_risks, seed.security_alerts, seed.general_tips, 'manual'
FROM (VALUES
  ('BR', 'Fiebre amarilla recomendada si visita la Amazonía u otras zonas de riesgo (consultar mapa vigente antes de viajar). Vacunas de rutina al día.',
        'Dengue, zika y chikungunya (transmisión por mosquito) presentes en gran parte del país, más riesgo en época de lluvias. Extremar cuidado con agua/alimentos en zonas rurales.',
        'Hurtos y robos frecuentes en zonas turísticas de grandes ciudades (Río de Janeiro, San Pablo) — evitar exhibir objetos de valor, especial cuidado de noche.',
        'Usar repelente para mosquitos durante el día (el dengue se transmite de día). Contratar asistencia al viajero con cobertura médica es especialmente recomendable.'),
  ('PE', 'Fiebre amarilla recomendada si visita la Amazonía. Vacunas de rutina al día.',
        'Mal de altura (soroche) en Cusco, Machu Picchu y otras zonas por encima de 2.500m — hidratarse bien y evitar esfuerzo físico intenso el primer día. Dengue en zonas de selva y costa norte.',
        'Extremar precauciones en transporte terrestre nocturno en algunas rutas del interior.',
        'Ascender gradualmente en zonas de altura si es posible. Cuidado con agua de la canilla — preferir agua embotellada.'),
  ('MX', 'Vacunas de rutina al día. Hepatitis A recomendada.',
        'Dengue y zika presentes en varias regiones, más en época de lluvias. Diarrea del viajero frecuente — cuidar el agua y los alimentos crudos.',
        'La situación de seguridad varía mucho por región y ciudad — conviene revisar alertas específicas del destino puntual antes de viajar, no solo del país en general.',
        'Evitar hielo de origen dudoso y agua de la canilla. Usar repelente contra mosquitos.'),
  ('IN', 'Hepatitis A y Fiebre Tifoidea recomendadas. Según la zona y duración del viaje, puede recomendarse Hepatitis B, Encefalitis Japonesa y Rabia — consultar con un centro de medicina del viajero.',
        'Malaria en varias regiones (consultar profilaxis según destino). Dengue presente en todo el país. Diarrea del viajero muy frecuente.',
        'Extremar cuidado en zonas de tránsito denso y grandes aglomeraciones. Revisar alertas específicas de la región a visitar.',
        'Beber solo agua embotellada o hervida, evitar hielo y verduras crudas sin pelar. Usar repelente contra mosquitos día y noche.'),
  ('TH', 'Hepatitis A y Fiebre Tifoidea recomendadas. Vacunas de rutina al día.',
        'Dengue presente todo el año, más en época de lluvias. Diarrea del viajero frecuente.',
        'Precaución especial al circular en moto/motocicleta (uno de los principales motivos de accidentes de turistas).',
        'Usar repelente contra mosquitos. Verificar que el seguro de viaje cubra accidentes en motocicleta si se planea alquilar una.'),
  ('ES', 'Vacunas de rutina al día — sin requerimientos especiales para la mayoría de los viajeros.',
        'Riesgo sanitario general bajo. En zonas rurales/boscosas del norte, posible exposición a garrapatas (primavera-verano).',
        'Hurtos/carteristas en zonas turísticas muy concurridas (Madrid, Barcelona) — cuidado habitual con pertenencias.',
        'Sistema de salud de buen nivel — igual se recomienda contar con asistencia al viajero por los costos de atención privada.'),
  ('US', 'Vacunas de rutina al día — sin requerimientos especiales para la mayoría de los viajeros.',
        'Riesgo sanitario general bajo. Los costos de atención médica son muy altos sin cobertura.',
        'La seguridad varía mucho según la ciudad/barrio — informarse sobre el destino puntual.',
        'Contratar un seguro de viaje con buena cobertura es especialmente importante por el costo de la atención médica privada.'),
  ('IT', 'Vacunas de rutina al día — sin requerimientos especiales para la mayoría de los viajeros.',
        'Riesgo sanitario general bajo. En zonas rurales/boscosas, posible exposición a garrapatas (primavera-verano).',
        'Hurtos/carteristas frecuentes en zonas turísticas muy concurridas (Roma, Milán, estaciones de tren) — cuidado habitual con pertenencias.',
        'Sistema de salud de buen nivel — igual se recomienda contar con asistencia al viajero por los costos de atención privada.')
) AS seed(code, vaccinations, health_risks, security_alerts, general_tips)
JOIN params.catalog_values cv ON cv.code = seed.code
JOIN params.domain_catalogs dc ON dc.id = cv.domain_id AND dc.code = 'COUNTRY'
WHERE cv.tenant_id IS NULL
ON CONFLICT (country_id) DO NOTHING;
