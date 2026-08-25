-- ============================================================
-- Pedido explícito del usuario: "tenemos que arreglar la forma de
-- expresarse, primero trata de vos y después de usted, hay que
-- unificar todo a comunicación simple... tener en cuenta en todo el
-- multilenguaje que manejamos" — las 26 preguntas fijas de Estructurado/
-- Formulario mezclaban registro formal (usted: "¿Le han practicado...?",
-- "¿Padece USTED de...?") con preguntas impersonales que en español son
-- gramaticalmente "usted" igual ("¿Tuvo...?", "¿Tiene...?", "¿Padece...?")
-- — se unifica TODO a voseo rioplatense (vos/tenés/tuviste), consistente
-- con el resto de la app (ya usaba vos en otros textos) y con las
-- instrucciones de tono de la síntesis de voz ("español rioplatense").
--
-- Multilenguaje: inglés no tiene esta distinción (queda igual). Portugués
-- ya usa "você", un registro neutro/informal habitual en Brasil, no
-- hace falta tocarlo. Francés SÍ tenía el mismo problema (registro
-- "vous", formal) — se convierte a "tu" en los 27 textos.
-- ============================================================

UPDATE ai.interview_questions SET question_text = v.es, question_text_fr = v.fr
FROM (VALUES
  ('CARDIOVASCULAR_DISEASE', '¿Tuviste o tenés alguna enfermedad cardiovascular?', 'As-tu eu ou as-tu actuellement une maladie cardiovasculaire ?'),
  ('CHRONIC_LUNG_DISEASE', '¿Tuviste o tenés alguna enfermedad pulmonar crónica?', 'As-tu eu ou as-tu actuellement une maladie pulmonaire chronique ?'),
  ('STROKE', '¿Tuviste un accidente cerebrovascular?', 'As-tu eu un accident vasculaire cérébral (AVC) ?'),
  ('MYOCARDIAL_INFARCTION', '¿Tuviste un infarto de miocardio?', 'As-tu eu un infarctus du myocarde ?'),
  ('CORONARY_ANGIOPLASTY', '¿Te hicieron una angioplastia coronaria?', 'As-tu subi une angioplastie coronaire ?'),
  ('OTHER_ANGIOPLASTY', '¿Te hicieron alguna angioplastia en otra parte del cuerpo?', 'As-tu subi une angioplastie dans une autre partie du corps ?'),
  ('DIABETES', '¿Tenés diabetes?', 'Es-tu diabétique ?'),
  ('GOUT', '¿Padecés de gota?', 'Souffres-tu de goutte ?'),
  ('HEMATOLOGIC_DISEASE', '¿Padecés una enfermedad hematológica, como hemofilia u otro trastorno de la coagulación?', 'Souffres-tu d''une maladie hématologique, telle que l''hémophilie ou un autre trouble de la coagulation ?'),
  ('TRANSIENT_ISCHEMIC_ATTACK', '¿Tuviste un episodio de isquemia cerebral transitoria?', 'As-tu eu un accident ischémique transitoire (AIT) ?'),
  ('PARKINSON', '¿Te diagnosticaron o padecés enfermedad de Parkinson?', 'La maladie de Parkinson t''a-t-elle été diagnostiquée, ou en souffres-tu ?'),
  ('HYPERTENSION', '¿Tenés hipertensión arterial?', 'Souffres-tu d''hypertension artérielle ?'),
  ('CURRENT_MEDICATIONS', '¿Qué medicamentos tomás?', 'Indique ci-dessous les médicaments que tu prends.'),
  ('ALLERGIES', '¿Sos alérgico a algo?', 'Es-tu allergique à quelque chose ?'),
  ('PEPTIC_ULCER', '¿Padecés o padeciste enfermedad ulcerosa gastroduodenal?', 'Souffres-tu ou as-tu souffert d''une maladie ulcéreuse gastroduodénale ?'),
  ('DIVERTICULAR_DISEASE', '¿Te diagnosticaron o padeciste alguna vez enfermedad diverticular del colon o episodios de diverticulitis?', 'Une maladie diverticulaire du côlon t''a-t-elle été diagnostiquée, ou as-tu déjà eu des épisodes de diverticulite ?'),
  ('RENAL_COLIC', '¿Sufriste cólicos renales?', 'As-tu eu des coliques néphrétiques ?'),
  ('BILIARY_COLIC', '¿Sufriste cólicos biliares?', 'As-tu eu des coliques biliaires ?'),
  ('ONCOLOGIC_DISEASE', '¿Sufriste o estás actualmente en tratamiento por enfermedades oncológicas?', 'As-tu souffert d''un cancer ou d''une autre maladie oncologique, ou es-tu actuellement en traitement pour l''une de ces maladies ?'),
  ('ANTICOAGULANTS', '¿Estás actualmente tomando medicación anticoagulante?', 'Prends-tu actuellement un traitement anticoagulant ?'),
  ('ATRIAL_FIBRILLATION', '¿Sufrís o sufriste episodios de fibrilación auricular?', 'Souffres-tu ou as-tu souffert d''épisodes de fibrillation atriale ?'),
  ('METABOLIC_DISEASE', '¿Padecés alguna enfermedad metabólica que requiera actualmente tratamiento?', 'Souffres-tu d''une maladie métabolique nécessitant actuellement un traitement ?'),
  ('CHRONIC_SINUSITIS', '¿Sufrís o tuviste episodios reiterados de sinusitis crónica?', 'Souffres-tu ou as-tu souffert d''épisodes récurrents de sinusite chronique ?'),
  ('CHRONIC_RENAL_FAILURE', '¿Padecés insuficiencia renal crónica?', 'Souffres-tu d''insuffisance rénale chronique ?'),
  ('DIALYSIS', '¿Estuviste alguna vez bajo tratamiento de diálisis?', 'As-tu déjà suivi un traitement par dialyse ?'),
  ('HEPATITIS', '¿Padecés o padeciste alguna forma de hepatitis?', 'Souffres-tu ou as-tu souffert d''une forme quelconque d''hépatite ?'),
  ('OPEN_ENDED_CATCH_ALL', '¿Hay algo más de tu salud que quieras contarme — otra enfermedad, medicamento, análisis o estudio, cirugía, alergia o algo implantado — que no te haya preguntado antes?', 'Y a-t-il autre chose à propos de ta santé que tu aimerais me dire — une autre maladie, un médicament, une analyse ou un examen, une chirurgie, une allergie ou quelque chose d''implanté — que je ne t''ai pas encore demandé ?')
) AS v(code, es, fr)
WHERE ai.interview_questions.code = v.code;

-- Saludos de Estructurado (params.app_settings) — mismo criterio.
UPDATE params.app_settings SET setting_value =
  'Hola {firstName}, soy tu asistente virtual para confeccionar tu historia clínica de salud.

Estos datos son total y absolutamente confidenciales y solo podrán ser utilizados por vos en caso de requerir atención médica durante tu viaje, y con el objetivo de facilitar el acceso a una correcta atención.

Comenzaremos a registrar tus datos de salud.'
WHERE setting_key = 'assistant.structured_greeting_new';

UPDATE params.app_settings SET setting_value =
  'Hola {firstName}, soy tu asistente virtual de Historial de Salud.

Ya tenés datos cargados — la última actualización fue el {lastUpdated}. Esto va a funcionar como una actualización: voy a saltear lo que ya está confirmado y solo preguntarte por lo que falta o cambió.

Comenzaremos a repasar tus datos de salud.'
WHERE setting_key = 'assistant.structured_greeting_update';
