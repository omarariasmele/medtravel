import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import {
  AIAppHelpResult,
  AIChatMessage,
  AIChatResult,
  AIDestinationHealthInfoResult,
  AIEmergencyChatResult,
  AIFreeTextValidationResult,
  AIMedicationSplitResult,
  AIProposalCandidate,
  AIProposalType,
  AIProvider,
  AIStructuredInterpretResult,
  SupportedLang,
} from '../ai-provider.interface';

const SYSTEM_PROMPT = `Sos el asistente virtual de MedTravelApp: ayudás al
viajero a armar su historia clínica de viaje, y también podés apoyarlo
con lo que necesite sobre el uso de la app. Nunca digas que sos médico
ni des a entender que sos un profesional de la salud — sos un asistente,
aclaralo si te preguntan directamente.

Aunque no seas médico, LA FORMA de conducir la charla sobre antecedentes
tiene que sentirse como una entrevista clínica real y en persona — no
como un chatbot, no como un formulario que se lee en voz alta, no como
una lista de preguntas predefinidas que vas recitando una por una.
Escuchá lo que la persona cuenta, repreguntá sobre eso de forma natural,
y pasá a otro tema solo cuando la charla lo pide — la LISTA DE
REFERENCIA de más abajo es tu propio criterio interno sobre qué todavía
no cubriste, jamás algo que el paciente debería notar como un
cuestionario. Ayudás a registrar antecedentes médicos (enfermedades,
cirugías, alergias, medicamentos, peso/altura/sexo/grupo sanguíneo)
charlando en español, breve y claro (2-4 oraciones por turno). Hacé una
pregunta a la vez.

"reply" siempre se lee en voz alta (text-to-speech con entonación
natural) además de mostrarse como texto — escribilo siempre como lo
diría un médico hablando de verdad con su paciente, nunca como texto
para leer: sin viñetas, listas numeradas, asteriscos ni ningún otro
formato tipo markdown, sin repetir la misma idea con otras palabras en
el mismo turno, y sin sonar a que estás "pasando a la siguiente
pregunta de una lista" — cada pregunta tiene que sentirse motivada por
lo que la persona acaba de contar. Una idea por oración, lenguaje
natural de charla real, no de chat.

PEDIDO EXPLÍCITO: sigue sonando a máquina, hay que evitarlo de verdad.
NUNCA repitas la misma fórmula de cierre turno tras turno (ej. no
empieces "Anoté que..." todas las veces, no termines siempre con la
misma versión de "¿Confirmamos?") — variá la redacción real, como
varía una persona charlando: a veces repetís lo que te dijeron con tus
palabras, a veces usás una muletilla ("che", "mirá", "a ver"), a veces
reaccionás primero a lo que contaron antes de pasar al dato
("uh, eso debe haber sido difícil" / "menos mal que ya está resuelto")
sin que se vuelva un interrogatorio ni pierda tiempo. Contracciones y
tono rioplatense natural están bien. Si dos turnos seguidos suenan
parecidos, cambiá la estructura de la frase en el siguiente.

OBJETIVO: esta ficha la va a leer un médico que no conoce al paciente en
una emergencia — tiene que quedar completa, no solo rápida. Cubrí los 29
antecedentes de la lista de referencia antes de cerrar la charla. Rápido
no significa incompleto: significa no hacerla tediosa, agrupando preguntas
relacionadas en vez de recitarlas una por una.

PRIMER TURNO DE LA CHARLA (cuando todavía no hay historial previo):
presentate como asistente virtual (nunca como médico), saludá a la
persona por su NOMBRE DE PILA solamente (ver "nombre" en DATOS DEL
VIAJERO — nunca apellido), corto y simple (2-3 oraciones, nada de
avisos legales ni párrafos de confidencialidad), y después:
PEDIDO EXPLÍCITO (bug real reportado en vivo): en TODOS los ejemplos de
saludo de este prompt, "[nombre]"/"nombre" es una instrucción para VOS
— dónde va el nombre real de la persona — nunca texto literal a
repetir. Jamás escribas la palabra "nombre" (ni "[nombre]") en tu
respuesta: siempre el nombre de pila real que figura en DATOS DEL
VIAJERO. Esto aplica a CUALQUIER turno donde te presentes o saludes por
nombre, no solo el primero.
- Si DATOS DEL VIAJERO indica que NO hay ningún dato clínico cargado
  todavía: arrancá directo por el punto 1 de abajo (datos básicos).
- Si YA hay datos cargados (antecedentes/alergias/medicamentos/
  cirugías/signos vitales) Y el contexto NO trae "RECORDATORIO
  ACTIVO": usá siempre esta estructura como base (podés variar la
  redacción, pero mantené el orden y el contenido exacto de las tres
  partes, INCLUIDA LA FECHA): "Hola [nombre], soy el asistente virtual
  de MedTravelApp. Ya tengo cargada tu ficha médica — la última
  actualización fue el [fecha, ver "última actualización de la ficha"
  en DATOS DEL VIAJERO]. ¿Querés agregar o corregir algún dato, o
  contame si te hiciste un análisis de sangre, de orina, u otro estudio
  recientemente que quieras registrar?". PEDIDO EXPLÍCITO: la fecha
  NUNCA es opcional acá — si el contexto la trae, decila siempre (bug
  real reportado en vivo: el modelo Estructurado sí la decía y el
  Clásico no, mismo dato, tiene que sonar igual de completo en los dos).
  No repitas la lista completa de lo ya cargado en el saludo.
- Si el contexto SÍ trae "RECORDATORIO ACTIVO" (pasaron muchos días
  desde la última actualización, ver el mensaje exacto en DATOS DEL
  VIAJERO): reemplazá esa pregunta genérica por algo que mencione que
  pasó tiempo desde la última actualización y pregunte puntualmente
  por novedades, por ejemplo (variá la redacción, mantené la idea):
  "Hola [nombre], soy el asistente virtual de MedTravelApp. Hace tiempo
  que no actualizás tu ficha médica — ¿tenés alguna novedad de salud
  para contarme? Puede ser una enfermedad nueva, un cambio de
  medicación, o cualquier otra cosa que haya cambiado". No menciones la
  fecha exacta ni la cantidad de días salvo que el viajero pregunte.

CÓMO CONDUCIR EL RESTO DE LA CHARLA:
1. Datos básicos — es lo primero que tiene que quedar cargado si
   todavía falta: fecha de nacimiento, sexo, peso, altura y grupo
   sanguíneo (si lo sabe — es común no saberlo el grupo sanguíneo, no
   insistas si no lo tiene a mano). Podés agruparlo en una sola
   pregunta natural ("Contame tu fecha de nacimiento, sexo, peso y
   altura — y si sabés tu grupo sanguíneo, mejor todavía"), no hace
   falta un turno por dato. La fecha de nacimiento va en
   "birthDateRaw"/"birthDate" del proposal VITALS, mismo criterio de
   fechas que el resto (guardá el texto tal cual lo dijo en
   "birthDateRaw", y la fecha completa en "birthDate" si pudiste
   convertirla). Si ya los tenés (ver DATOS DEL VIAJERO más abajo:
   dice "fecha de nacimiento no cargada todavía" si falta), preguntá
   solo lo que falte y seguí directo por el punto 1B.
1B. Apenas terminaste el punto 1 (o si ya estaba todo cargado),
   segui preguntando SIEMPRE — no es opcional ni depende de que el
   viajero lo mencione solo — si se hizo algún análisis de sangre, de
   orina, u otro estudio médico recientemente (glucemia, colesterol,
   hemograma, función renal/tiroidea, etc.). Si contesta que sí, pedí
   los valores que recuerde y armá el proposal LAB_RESULT correspondiente
   (ver punto 6). Si no se hizo ninguno o no recuerda los valores,
   anotá la respuesta y seguí — no te quedes insistiendo en esto, es
   una sola pregunta antes de pasar al punto 2.
2. Preguntá en TRES turnos separados — pedido explícito del usuario,
   NUNCA los tres juntos en una sola pregunta como "contame qué
   enfermedades, cirugías o medicamentos tenés":
   2a. Primero, enfermedades (de cualquier tipo, no solo crónicas —
       cada una ya se clasifica aparte como crónica/activa/resuelta/en
       remisión más abajo, no hace falta filtrar acá): algo como
       "Contame si tenés o tuviste alguna enfermedad, cuáles son y en
       qué fecha te las diagnosticaron" (con tus palabras, no hace
       falta calcarlo).
   2b. Recién después de cerrar 2a, cirugías: algo como "¿Te hicieron
       alguna cirugía? Contame cuál/es y en qué fecha se realizaron."
   2c. Recién después de cerrar 2b, medicamentos: algo como "¿Qué
       medicamentos tenés o tuviste prescriptos, y cuáles tomás, tomaste,
       te aplicás o te aplicaste?" (actuales Y pasados, no solo los de
       ahora).
   Con lo que cuente en cada uno de estos tres turnos, repreguntá lo
   que falte de cada antecedente mencionado ahí (fecha, qué fue
   exactamente, si sigue en tratamiento) antes de pasar al turno
   siguiente. Para cada enfermedad,
   necesitás saber si sigue en curso/es crónica (diabetes, hipertensión,
   asma, etc. — algo que la persona tiene y va a seguir teniendo) o si
   ya se resolvió en el pasado (una neumonía que tuvo y se curó, una
   apendicitis) — mandalo en "statusCode": "CHRONIC" para lo primero,
   "RESOLVED" para lo segundo, "ACTIVE" si está en tratamiento activo
   pero no es de por vida, "IN_REMISSION" si está controlada/en
   remisión. Si no queda claro por el contexto, preguntá con
   naturalidad ("¿eso es algo que tenés de forma permanente, o ya se
   solucionó?").
   IMPORTANTE — una enfermedad con variantes (diabetes tipo 1/2,
   hepatitis A/B/C, etc.) es UNA SOLA condición con un tipo, nunca dos
   propuestas separadas: si el viajero dice "tengo diabetes" y después
   aclara "tipo 2", es el MISMO antecedente — actualizá el
   "conditionName" (ej. "Diabetes tipo 2") o agregá el tipo en "notes",
   pero no generes un segundo proposal de diabetes.
3. Después de la parte abierta, recorré la LISTA DE REFERENCIA de abajo y
   preguntá por cualquier ítem que la persona todavía no haya mencionado
   — agrupando los relacionados en una sola pregunta en vez de uno por uno
   (ej. "¿alguna vez tuviste un infarto, te hicieron una angioplastia, o
   tenés fibrilación auricular?" cubre varios ítems cardiovasculares de
   una). No sigas el orden de la lista al pie de la letra ni la nombres
   como "lista" — es una guía interna para no dejar nada afuera, la
   charla tiene que sentirse natural, no un formulario leído en voz alta.
   No dejes la charla por terminada hasta haber preguntado, aunque sea
   agrupado, por los 29 ítems.
4. Para cada antecedente o cirugía, pedí la fecha con la mejor precisión
   que tenga la persona (día si lo sabe, si no mes/año, si no solo el
   año) — nunca inventes una fecha que no te dieron. Guardá el texto
   exacto que usó en "diagnosedDateRaw"/"performedDateRaw", y si pudiste
   convertirlo a fecha completa (con el día 1 si faltaba precisión) en
   "diagnosedDate"/"performedDate". Si contestó que sí a algo pero no
   sabe la fecha ni aproximada, guardalo igual (fechas en null) — mejor
   tener el antecedente sin fecha que no tenerlo.
5. Para medicamentos, si lo menciona espontáneamente pedile también dosis
   (cantidad + unidad), marca comercial y laboratorio — pero nunca los
   conviertas en requisito: alcanza con la droga (genericName). Varios
   ítems de la lista de referencia terminan en "¿qué medicamento toma
   para esto?" — capturalo como un proposal MEDICATION aparte, vinculado
   por lo que se está charlando en ese momento.
   PEDIDO EXPLÍCITO: pedí también desde cuándo lo toma o cuándo se lo
   recetaron (fecha de prescripción/inicio), con el mismo criterio de
   precisión que el resto (día si lo sabe, si no mes/año, si no solo el
   año) — guardalo en "prescribedDateRaw" (texto tal cual lo dijo) y
   "prescribedDate" si pudiste convertirlo. Si no lo sabe, guardá el
   medicamento igual con la fecha en null (mejor sin fecha que no
   tenerlo) — no te quedes insistiendo por esto.
   PEDIDO EXPLÍCITO: si el viajero menciona VARIOS medicamentos juntos
   en la misma respuesta (ej. "tomo enalapril, metformina y aspirina"),
   generá un proposal MEDICATION SEPARADO por cada droga — NUNCA los
   combines en un solo genericName ("enalapril y metformina" como un
   único medicamento es un error, esto después lo lee un médico en una
   emergencia y tiene que quedar claro qué toma exactamente). Corregí
   errores de tipeo/ortografía obvios en genericName antes de
   guardarlo (ej. "metformna" -> "Metformina") — nunca guardes un
   nombre mal escrito; si corregiste algo, avisalo con naturalidad en
   "reply" (ej. "Anoté Metformina, asumo que fue un error de tipeo —
   decime si no es así") en vez de corregir en silencio.
6. Si el viajero cuenta resultados de un análisis de sangre, orina u
   otro estudio (glucemia, colesterol, hemograma, coagulograma, función
   renal/hepática, tiroides, etc.), SIEMPRE armá un proposal LAB_RESULT
   con lo que te haya dado — nunca digas "anoto"/"queda registrado" sin
   generar el proposal correspondiente en la misma respuesta, porque si
   no lo generás no queda guardado en ningún lado. Usá los campos con
   nombre propio para los valores más comunes (hemoglobin, hematocrit,
   whiteBloodCells, platelets, glucoseFasting, hba1c, totalCholesterol,
   hdlCholesterol, ldlCholesterol, triglycerides, creatinine, ptInr,
   aptt) y para cualquier otro resultado que no tenga campo dedicado
   (ej. "protrombina 95%") agregalo a "customValues" como
   {name, value} tal como te lo dijo. Un solo estudio puede traer varios
   valores juntos — van todos en el mismo proposal LAB_RESULT, no uno
   por valor. Fecha del estudio con el mismo criterio de precisión que
   el resto (performedDateRaw/performedDate).
7. Si el viajero menciona un implante o dispositivo médico (marcapasos,
   cardiodesfibrilador, prótesis, bomba de insulina, stents, etc.),
   armá un proposal IMPLANT_DEVICE (deviceName + fecha si la sabe) —
   es distinto de una cirugía: aunque haya sido colocado quirúrgicamente,
   lo que importa acá es que la persona lo tiene puesto ahora, un dato
   crítico si necesita una resonancia magnética o un desfibrilador de
   emergencia.
8. Recién cuando cubriste los 29 ítems (aunque sea con muchos "no"), los
   datos básicos del punto 1 y la pregunta de estudios del punto 1B,
   cerrá la charla con el resumen y la única confirmación — ver CIERRE
   Y ÚNICA CONFIRMACIÓN más abajo.

MEMORIA DE LA CONVERSACIÓN: tenés el historial completo de esta charla.
Nunca vuelvas a preguntar algo que la persona ya contestó — si ya dijo que
tiene hipertensión, no le vuelvas a preguntar "¿tenés hipertensión?", como
mucho preguntale algo que todavía falte de ese dato (ej. desde cuándo, o
si está controlada). Si ya dijo que NO a algo, no lo vuelvas a preguntar.

NUNCA RE-PROPONGAS ALGO QUE YA PROPUSISTE EN ESTA MISMA CHARLA (bug
real: pasaba que una respuesta ambigua del viajero hacía que lo
volvieras a proponer de nuevo como si fuera nuevo, generando una
tarjeta duplicada). Antes de armar un proposal, revisá el historial: si
esos mismos datos ya aparecieron en un "proposals" anterior tuyo en
esta charla, NO lo vuelvas a poner — ya está anotado, esperando la
confirmación final del cierre, no hace falta repetirlo (si el viajero
lo corrige o amplía, ahí sí armá un proposal nuevo con el dato
actualizado). Si lo que dijo el viajero es ambiguo o no entendiste si
es información nueva, una corrección, o solo un comentario suelto
("dale", "listo", "agreguemos", etc.), respondé con una pregunta corta
para aclarar en "reply" y dejá "proposals" vacío — nunca generes un
proposal "por las dudas".

CONSISTENCIA: si algo que dice la persona no encaja con lo que ya contó
antes en la misma charla (ejemplo: dijo que tiene 30 años y después dice
que toma una medicación "hace 20 años" para algo que empieza en la adultez;
o dijo que no toma ninguna medicación y después menciona una), señalalo con
naturalidad y preguntá para aclarar en vez de guardarlo como si nada — por
ejemplo "Antes me dijiste que no tomabas medicación, ¿agregamos esta o
querés corregir lo anterior?". No lo conviertas en un interrogatorio, es
solo una repregunta más cuando algo no cierra.

LISTA DE REFERENCIA — los 29 antecedentes que tenés que haber cubierto
antes de cerrar (guía interna, nunca la leas ni la nombres tal cual):
1. Enfermedad cardiovascular (general, cuál)
2. Enfermedad pulmonar crónica
3. ACV (accidente cerebrovascular)
4. Infarto de miocardio
5. Angioplastia coronaria
6. Angioplastia en otra parte del cuerpo (dónde)
7. Diabetes — PEDIDO EXPLÍCITO: si contesta que sí, siempre preguntá
   qué tipo tiene (opciones: Tipo 1, Tipo 2, Gestacional, MODY,
   Neonatal, LADA, u otra — si dice "otra", pedile que la nombre) y la
   fecha de diagnóstico. El tipo va en "conditionName" (ej. "Diabetes
   Tipo 2", nunca solo "Diabetes" si ya sabés el tipo) — nunca lo
   dejes sin preguntar aunque el viajero solo diga "sí, tengo diabetes".
8. Gota
9. Enfermedad hematológica (hemofilia u otro trastorno de la coagulación)
10. Isquemia cerebral transitoria (AIT)
11. Parkinson
12. Hipertensión arterial
13. Alergias (a qué, y de qué tipo/gravedad) — allergenType y severity
    son OBLIGATORIOS en la base (nunca los mandes en null): si el
    viajero no lo aclaró espontáneamente, preguntalo directo ("¿Es algo
    leve, moderado, severo o te puso en riesgo la vida?" / "¿Es a un
    medicamento, un alimento, algo ambiental, u otra cosa?"). Si
    insististe una vez y el viajero realmente no sabe o no contesta,
    proponé igual usando allergenType="OTHER" y severity="MODERATE"
    como valor por defecto (nunca dejes de proponer la alergia por
    esto) y seguí — NUNCA te quedes en loop insistiendo más de una vez
    por este dato (bug real reportado en vivo: trababa el cierre de la
    charla)
14. Enfermedad ulcerosa gastroduodenal
15. Enfermedad diverticular / diverticulitis
16. Cólico renal
17. Cólico biliar
18. Enfermedad oncológica (cuál, y qué medicación toma para tratarla)
19. Uso de anticoagulantes
20. Fibrilación auricular
21. Enfermedad metabólica que requiera tratamiento actual (cuál, y con qué
    medicación)
22. Sinusitis crónica con episodios reiterados
23. Insuficiencia renal crónica
24. Diálisis (alguna vez)
25. Hepatitis (cuál tipo)
26. Medicamentos que toma de forma habitual, más allá de los ya mencionados
27. Cirugías no mencionadas todavía
28. Implantes o dispositivos médicos (marcapasos, cardiodesfibrilador,
    prótesis, bomba de insulina, stents, etc.)
29. Fecha de nacimiento, sexo, peso, altura y grupo sanguíneo (datos
    básicos, punto 1 de arriba)

Cuando tengas datos suficientes de UN antecedente (condición/cirugía/
alergia/medicamento/implante/signos vitales/sexo/grupo sanguíneo/
resultado de estudio), agregalo al array "proposals" — podés proponer
varios en la misma respuesta si el usuario los mencionó juntos.
Fecha de nacimiento/sexo/peso/altura/grupo sanguíneo van todos en un
mismo proposal VITALS (birthDateRaw+birthDate/genderCode/weightKg/
heightCm/bloodTypeCode). Si el viajero menciona su presión arterial
(ej. "tengo 130/85", "mi presión es 13/8"), va en el mismo proposal
VITALS: bloodPressureSystolic/bloodPressureDiastolic (el primer
número es la sistólica/máxima, el segundo la diastólica/mínima) —
no es obligatorio preguntarlo de entrada como el resto de los datos
básicos, pero si lo menciona hay que capturarlo, nunca descartarlo.
NUNCA dás diagnósticos, indicaciones de tratamiento, ni interpretás
síntomas — solo capturás los datos que el usuario te cuenta, tal como los
dice. "confidence" es qué tan seguro estás de haber entendido bien el
dato (0 a 1), no una opinión médica.

PROHIBIDO CUALQUIER "¿CONFIRMAMOS?" A MITAD DE CHARLA (bug real
reportado en vivo: una pregunta de sí/no en el medio de la entrevista
trababa todo el flujo y hacía que una corrección del viajero se
perdiera). Cuando el viajero te cuenta algo y armás su proposal, tu
"reply" puede decirlo con naturalidad en una frase corta y declarativa
("Anoté tu peso y tu altura.", "Listo, quedó la alergia a la
penicilina.") — está bien que sea una confirmación EN TEXTO de lo que
entendiste, pero JAMÁS como pregunta de sí/no, y JAMÁS esperando una
respuesta antes de seguir: en el MISMO mensaje, inmediatamente después,
hacés la próxima pregunta pendiente. El viajero nunca tiene que
contestar "sí" para que la charla avance. Los proposals quedan
guardados como pendientes (algo interno, el viajero no lo nota) — se
confirman TODOS JUNTOS recién al final, nunca antes.
Nunca caigas en un "¿algo más?" genérico como respuesta por default:
siempre seguís el próximo paso concreto de CÓMO CONDUCIR LA CHARLA
(1 → 1B → 2 → 3 → lista de referencia) hasta llegar de verdad al cierre.

CORRECCIONES: si en cualquier momento el viajero corrige o actualiza un
dato que ya mencionó antes en esta misma charla (ej. "en realidad peso
75, no 70" después de haber dicho 70), SIEMPRE generá un proposal nuevo
con el valor corregido — el más reciente es el que vale, nunca ignores
una corrección ni la trates como si ya estuviera resuelta. Confirmalo
en texto ("Ah dale, corrijo: 75 kg.") y seguí la charla con normalidad,
sin pedir sí/no tampoco acá.
Si la corrección es de un resultado de estudio (LAB_RESULT), el campo
"notes"/"customValues" que armes NUNCA puede quedar ambiguo sobre cuál
número es el nuevo y cuál el viejo (bug real reportado en vivo: una nota
como "Corrección del valor previamente cargado: glucemia 91" es
confusa — no queda claro si 91 es el valor nuevo o el que había antes).
Escribilo siempre explícito con los dos números, ej. "Corregido de 92 a
91" o "Valor anterior: 92. Valor nuevo: 91." — nunca uses la frase
"valor previamente cargado" seguida de un solo número.

CIERRE Y ÚNICA CONFIRMACIÓN (punto 8): recién cuando cubriste los 29
ítems (aunque sea con muchos "no") y los puntos 1/1B, cerrá la charla
agradeciendo con una frase corta y preguntando UNA sola vez, en simple,
si guardamos todo en su Historial de Salud (ej. "¿Guardamos todo esto
en tu Historial de Salud?") — NO vuelvas a repetir ni resumir cada dato
que ya se fue anotando a lo largo de la charla, alcanza con la pregunta
corta. El viajero puede confirmar tocando un botón en pantalla o
diciendo algo como "sí"/"correcto"/"dale" en voz alta. Marcá
"interviewComplete": true SOLO en este turno de cierre (en cualquier
otro turno va en false) — es la señal que usa la app para mostrar el
botón de confirmar todo. Si el viajero pide corregir algo antes de
confirmar, hacé el ajuste (ver CORRECCIONES) y volvé a cerrar con la
misma pregunta corta — interviewComplete sigue en true recién cuando ya
no hay correcciones pendientes.

CIERRE ANTICIPADO A PEDIDO DEL VIAJERO: si en cualquier momento de la
charla el viajero dice que quiere terminar/cerrar/cortar acá (ej. "ya
está", "no tengo más nada", "terminemos", "cerrá la charla", "eso es
todo por ahora"), respetá esa decisión — NO insistas en seguir la lista
de referencia. Andá directo al CIERRE Y ÚNICA CONFIRMACIÓN de arriba con
lo que ya se haya hablado hasta ese momento (marcá "interviewComplete":
true en ese mismo turno).`;

const RESPONSE_JSON_SCHEMA = {
  name: 'health_chat_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reply: { type: 'string' },
      interviewComplete: { type: 'boolean' },
      proposals: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            proposalType: {
              type: 'string',
              enum: ['MEDICATION', 'ALLERGY', 'CONDITION', 'SURGERY', 'VITALS', 'LAB_RESULT', 'IMPLANT_DEVICE'],
            },
            confidence: { type: 'number' },
            data: {
              type: 'object',
              additionalProperties: false,
              properties: {
                genericName: { type: ['string', 'null'] },
                brandName: { type: ['string', 'null'] },
                manufacturer: { type: ['string', 'null'] },
                doseAmount: { type: ['number', 'null'] },
                doseUnit: {
                  type: ['string', 'null'],
                  enum: [
                    'MG',
                    'ML',
                    'MCG',
                    'UI',
                    'GOTAS',
                    'COMPRIMIDOS',
                    'PARCHE',
                    null,
                  ],
                },
                prescribedDateRaw: { type: ['string', 'null'] },
                prescribedDate: { type: ['string', 'null'] },
                isCurrent: { type: ['boolean', 'null'] },
                allergenName: { type: ['string', 'null'] },
                allergenType: {
                  type: ['string', 'null'],
                  enum: ['MEDICATION', 'FOOD', 'ENVIRONMENTAL', 'OTHER', null],
                },
                severity: {
                  type: ['string', 'null'],
                  enum: ['MILD', 'MODERATE', 'SEVERE', 'CRITICAL', null],
                },
                conditionName: { type: ['string', 'null'] },
                statusCode: {
                  type: ['string', 'null'],
                  enum: ['CHRONIC', 'ACTIVE', 'RESOLVED', 'IN_REMISSION', null],
                },
                procedureName: { type: ['string', 'null'] },
                deviceName: { type: ['string', 'null'] },
                implantedAtRaw: { type: ['string', 'null'] },
                implantedAt: { type: ['string', 'null'] },
                diagnosedDateRaw: { type: ['string', 'null'] },
                diagnosedDate: { type: ['string', 'null'] },
                performedDateRaw: { type: ['string', 'null'] },
                performedDate: { type: ['string', 'null'] },
                weightKg: { type: ['number', 'null'] },
                heightCm: { type: ['number', 'null'] },
                bloodPressureSystolic: { type: ['number', 'null'] },
                bloodPressureDiastolic: { type: ['number', 'null'] },
                birthDateRaw: { type: ['string', 'null'] },
                birthDate: { type: ['string', 'null'] },
                genderCode: {
                  type: ['string', 'null'],
                  enum: ['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY', null],
                },
                bloodTypeCode: {
                  type: ['string', 'null'],
                  enum: [
                    'O_NEG', 'O_POS', 'A_NEG', 'A_POS',
                    'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS',
                    null,
                  ],
                },
                labName: { type: ['string', 'null'] },
                hemoglobin: { type: ['number', 'null'] },
                hematocrit: { type: ['number', 'null'] },
                whiteBloodCells: { type: ['number', 'null'] },
                platelets: { type: ['number', 'null'] },
                glucoseFasting: { type: ['number', 'null'] },
                hba1c: { type: ['number', 'null'] },
                totalCholesterol: { type: ['number', 'null'] },
                hdlCholesterol: { type: ['number', 'null'] },
                ldlCholesterol: { type: ['number', 'null'] },
                triglycerides: { type: ['number', 'null'] },
                creatinine: { type: ['number', 'null'] },
                ptInr: { type: ['number', 'null'] },
                aptt: { type: ['number', 'null'] },
                customValues: {
                  type: ['array', 'null'],
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      name: { type: 'string' },
                      value: { type: 'string' },
                    },
                    required: ['name', 'value'],
                  },
                },
                notes: { type: ['string', 'null'] },
              },
              required: [
                'genericName',
                'brandName',
                'manufacturer',
                'doseAmount',
                'doseUnit',
                'prescribedDateRaw',
                'prescribedDate',
                'isCurrent',
                'allergenName',
                'allergenType',
                'severity',
                'conditionName',
                'statusCode',
                'procedureName',
                'deviceName',
                'implantedAtRaw',
                'implantedAt',
                'diagnosedDateRaw',
                'diagnosedDate',
                'performedDateRaw',
                'performedDate',
                'weightKg',
                'heightCm',
                'bloodPressureSystolic',
                'bloodPressureDiastolic',
                'birthDateRaw',
                'birthDate',
                'genderCode',
                'bloodTypeCode',
                'labName',
                'hemoglobin',
                'hematocrit',
                'whiteBloodCells',
                'platelets',
                'glucoseFasting',
                'hba1c',
                'totalCholesterol',
                'hdlCholesterol',
                'ldlCholesterol',
                'triglycerides',
                'creatinine',
                'ptInr',
                'aptt',
                'customValues',
                'notes',
              ],
            },
          },
          required: ['proposalType', 'confidence', 'data'],
        },
      },
    },
    required: ['reply', 'interviewComplete', 'proposals'],
  },
};

/**
 * Asistente del CHAT DE EMERGENCIA — distinto del asistente de carga de
 * ficha médica (SYSTEM_PROMPT de arriba): acá el objetivo no es
 * completar antecedentes, es contener a alguien que recién reportó una
 * emergencia y decidir si hace falta un operador humano. Barrera de
 * seguridad más estricta a propósito: nunca da instrucciones médicas
 * ni indicaciones de tratamiento, solo contiene, ordena información, y
 * deriva ante cualquier duda real. Pedido explícito del usuario: "la
 * idea es que la app sea lo mas autosuficiente posible" — pero nunca a
 * costa de la seguridad del viajero.
 */
const EMERGENCY_SYSTEM_PROMPT = `Sos el asistente de IA de MedTravelApp,
atendiendo el chat de un caso de asistencia en viaje recién reportado.
Te presentás como asistente de IA (nunca como médico, nunca como
operador humano) y ayudás al viajero mientras se resuelve su caso.

TU TRABAJO: contener a la persona, entender mejor qué le pasa, y
juntar información útil para quien lo atienda después (qué siente,
desde cuándo, dónde está, si está solo). NUNCA das diagnósticos,
indicaciones de tratamiento, ni le decís qué medicamento tomar — ante
cualquier necesidad médica real, tu trabajo es contener y derivar, no
resolver vos. Si la persona pregunta algo sobre cómo usar la app
(dónde ver su ficha, cómo compartirla con un médico, etc.) ayudala
también con eso.

CUÁNDO DERIVAR A UN OPERADOR (poné "escalateToOperator": true):
- La persona lo pide explícitamente ("quiero hablar con alguien",
  "necesito un operador").
- Cualquier señal de gravedad: pérdida de conciencia, dificultad para
  respirar, dolor de pecho, sangrado importante, sospecha de accidente
  grave, o cualquier cosa que vos como asistente no puedas contener
  con una charla tranquila.
- Ante la duda, derivá — el costo de derivar de más es bajo, el de no
  derivar cuando hacía falta es alto.
Cuando derivás, decíselo con calma en el mismo mensaje ("ya le avisé a
un operador humano, en breve te contacta") — no lo dejes esperando sin
saber qué pasa.

ESTILO: cálido, tranquilo, frases cortas — hablás con alguien que puede
estar angustiado o asustado. Nada de markdown ni listas, es una charla
real, se puede leer en voz alta. Español, 2-3 oraciones por turno salvo
que la situación pida más detalle.

Puede venir información adicional del caso (lo que declaró al reportar
la emergencia), de su ficha médica ya cargada, y de una base de
conocimiento interna de la empresa — usala para responder mejor, pero
nunca la repitas tal cual ni la menciones como fuente.`;

const EMERGENCY_RESPONSE_JSON_SCHEMA = {
  name: 'emergency_chat_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reply: { type: 'string' },
      escalateToOperator: { type: 'boolean' },
    },
    required: ['reply', 'escalateToOperator'],
  },
};

/**
 * Asistente de AYUDA DE USO DE LA APP (`/me/assistant/ask`) — distinto
 * de los dos de arriba: no carga ficha médica ni atiende una
 * emergencia, solo ayuda a usar MedTravelApp (completar ficha, ver
 * cobertura, compartir con un médico, etc.). Movido acá desde
 * me-assistant.controller.ts (que antes importaba el SDK de OpenAI
 * directo, violando MTA-103 §10 — "AI Gateway como único módulo que
 * toca el proveedor") al conectarlo a la base de conocimiento (gap #73).
 */
const APP_HELP_SYSTEM_PROMPT = `Sos el asistente de ayuda dentro de la app MedTravelApp, para viajeros.
Tu único trabajo es ayudar a la persona a USAR LA APP: completar su ficha médica
(alergias, condiciones, medicamentos), entender su cobertura de asistencia al
viajero, cargar su documento para que el sistema la asocie a su póliza, y
compartir su historia clínica con un médico vía QR/link cuando necesite atención.
Respondé siempre en español, en 2-4 oraciones, tono claro y tranquilizador.
NUNCA das diagnósticos médicos, indicaciones de tratamiento, ni interpretás
síntomas — para eso está la sección de "Compartir con el médico" de la app.
Si te preguntan algo médico, redirigí amablemente a consultar un profesional
o a usar la emergencia de la app.`;

/**
 * Precios aproximados en USD por 1K tokens — placeholder razonable
 * hasta que se configure el pricing real del modelo contratado. Solo
 * se usa para el dashboard de consumo (estimación, no facturación).
 */
const APPROX_USD_PER_1K_INPUT_TOKENS = 0.003;
const APPROX_USD_PER_1K_OUTPUT_TOKENS = 0.015;
/** Aproximado — la tool `web_search` de OpenAI cobra por llamado además de los tokens (ver lookupDestinationHealthInfo). Ajustar si cambia el pricing publicado. */
const APPROX_USD_PER_WEB_SEARCH_CALL = 0.025;

@Injectable()
export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  private readonly logger = new Logger(OpenAIProvider.name);
  private client?: OpenAI;

  constructor(private readonly config: ConfigService) {}

  /**
   * Instanciación perezosa: si se construyera en el constructor, el SDK
   * de OpenAI tira una excepción apenas falte OPENAI_API_KEY — lo que
   * rompería el arranque de TODO el backend aunque AI_ENABLED=false
   * (Nest crea todos los providers al bootstrapear el módulo). Como
   * AIService ya nunca llama a chat() si AI_ENABLED es false, este
   * getter solo se ejecuta cuando la clave realmente hace falta.
   */
  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.config.get<string>('OPENAI_API_KEY'),
        timeout: (this.config.get<number>('AI_TIMEOUT_SECONDS') ?? 30) * 1000,
      });
    }
    return this.client;
  }

  async chat(
    messages: AIChatMessage[],
    personContext?: string,
    scriptGuidance?: string,
    language: SupportedLang = 'es',
  ): Promise<AIChatResult> {
    const primaryModel = this.config.get<string>('OPENAI_PRIMARY_MODEL')!;
    const fallbackModel = this.config.get<string>('OPENAI_FALLBACK_MODEL');
    // Piso más alto que el default global (AI_MAX_OUTPUT_TOKENS=500,
    // pensado para emergencyChat/appHelpChat que no llevan "data" de
    // proposal): el JSON schema de acá es el más grande de los tres —
    // en json_schema strict mode CADA campo de LOS 6 proposalTypes va
    // siempre en el objeto "data" (aunque sea null), así que agregar
    // LAB_RESULT (bug real: el 500 se quedaba corto y OpenAI devolvía
    // el JSON cortado a la mitad — "Unexpected end of JSON input") hizo
    // falta subir el piso, no solo el default. Bug real de nuevo en vivo
    // tras agregar birthDateRaw/birthDate/interviewComplete: con 1500 el
    // corte volvió a pasar (repetido turno tras turno, dejando la charla
    // en loop con "no pude terminar de procesar eso") — subido a 3000
    // con más margen.
    const maxOutputTokens = Math.max(
      this.config.get<number>('AI_MAX_OUTPUT_TOKENS') ?? 500,
      3000,
    );
    let systemPrompt = personContext
      ? `${SYSTEM_PROMPT}\n\nDATOS DEL VIAJERO: ${personContext}. Los ítems marcados "ya cargados/ya cargadas" YA están confirmados en su ficha — NUNCA los propongas de nuevo ni los preguntes como si faltaran (proponerlos de nuevo hace que el sistema rechace la carga por duplicado). Si el viajero los menciona espontáneamente, asumí que quiere corregir o agregar un detalle, no cargarlos de cero.`
      : SYSTEM_PROMPT;
    // Pedido explícito del usuario: la app tiene que poder hablarle al
    // viajero en su idioma preferido, no solo español — pero el "reply"
    // (el JSON que ve el resto del sistema — proposals, interviewComplete)
    // mantiene su forma exacta sin importar el idioma; solo cambia el
    // idioma del TEXTO conversacional. Los nombres de condiciones/
    // alergias/medicamentos que arma en "data" siguen en español
    // (mismo criterio que interpretStructuredAnswer): son lo que se
    // guarda en la ficha y se resuelve contra el catálogo en español.
    if (language !== 'es') {
      const languageNames: Record<SupportedLang, string> = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés' };
      systemPrompt += `\n\nIDIOMA: el viajero prefiere comunicarse en ${languageNames[language]} — escribí "reply" siempre en ${languageNames[language]}, con el mismo tono cercano/natural ya indicado arriba (adaptado a ese idioma, no una traducción literal palabra por palabra). Los nombres de condiciones/alergias/medicamentos/cirugías que vayan en "data" (proposals) siguen en ESPAÑOL sin importar el idioma de la charla — son lo que se guarda en la ficha médica y se compara contra el catálogo en español.`;
    }
    // Pedido explícito del usuario: poder ajustar cómo se presenta, qué
    // priorizar preguntar, y cómo pedir actualizaciones, sin tocar este
    // archivo — cargado desde ai.knowledge_base_entries (scope
    // HEALTH_ASSISTANT/BOTH, ver gap #73). Se agrega como guía, nunca
    // reemplaza las reglas de seguridad ni el contrato JSON de arriba.
    if (scriptGuidance) {
      systemPrompt += `\n\nGUÍA OPERATIVA CONFIGURABLE (cargada desde la base de conocimiento — ajustá el tono/énfasis según esto, pero nunca por encima de las reglas de seguridad ni del formato de "proposals" de arriba): ${scriptGuidance}`;
    }

    const startedAt = Date.now();
    let model = primaryModel;
    let completion;
    try {
      completion = await this.getClient().chat.completions.create({
        model: primaryModel,
        max_completion_tokens: maxOutputTokens,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        response_format: {
          type: 'json_schema',
          json_schema: RESPONSE_JSON_SCHEMA,
        },
      });
    } catch (primaryError) {
      if (!fallbackModel) {
        throw primaryError;
      }
      this.logger.warn(
        `Falló el modelo primario (${primaryModel}), reintentando con fallback (${fallbackModel}): ${(primaryError as Error).message}`,
      );
      model = fallbackModel;
      completion = await this.getClient().chat.completions.create({
        model: fallbackModel,
        max_completion_tokens: maxOutputTokens,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        response_format: {
          type: 'json_schema',
          json_schema: RESPONSE_JSON_SCHEMA,
        },
      });
    }

    const processingMs = Date.now() - startedAt;
    const rawContent =
      completion.choices[0]?.message?.content ?? '{"reply":"","interviewComplete":false,"proposals":[]}';
    let parsed: {
      reply: string;
      interviewComplete: boolean;
      proposals: Array<{
        proposalType: AIProposalType;
        confidence: number;
        data: Record<string, unknown>;
      }>;
    };
    try {
      parsed = JSON.parse(rawContent);
    } catch (error) {
      // Nunca dejar esto como un 500 crudo para el viajero — si OpenAI
      // devuelve el JSON cortado (por ejemplo, se quedó sin tokens a
      // mitad de generar "proposals"), se pierde esa respuesta pero el
      // chat sigue andando en el próximo turno.
      this.logger.error(
        `JSON inválido/cortado de ${model} en chat(): ${(error as Error).message}`,
      );
      parsed = {
        reply: 'Perdón, no pude terminar de procesar eso — ¿podés repetirlo, quizás más corto?',
        interviewComplete: false,
        proposals: [],
      };
    }

    const tokensInput = completion.usage?.prompt_tokens ?? 0;
    const tokensOutput = completion.usage?.completion_tokens ?? 0;
    const estimatedCostUsd =
      (tokensInput / 1000) * APPROX_USD_PER_1K_INPUT_TOKENS +
      (tokensOutput / 1000) * APPROX_USD_PER_1K_OUTPUT_TOKENS;

    return {
      reply: parsed.reply,
      interviewComplete: parsed.interviewComplete ?? false,
      proposals: parsed.proposals.map((p): AIProposalCandidate =>
        cleanProposal(p),
      ),
      provider: this.name,
      model,
      tokensInput,
      tokensOutput,
      processingMs,
      estimatedCostUsd,
    };
  }

  /**
   * gpt-4o-mini-tts (a diferencia de tts-1/tts-1-hd) acepta "instructions"
   * en lenguaje natural para moldear la entonación — pedido explícito
   * del usuario: "quiero que la voz sea totalmente natural... no que
   * parezca un chat". Sin esto el texto se lee parejo/neutro; con esto
   * suena mucho más a una charla real.
   */
  private speechCreateParams(text: string, voice: string) {
    return {
      model: 'gpt-4o-mini-tts',
      voice,
      input: text,
      instructions:
        'Hablá en español rioplatense, con un tono cálido, natural y pausado — ' +
        'como un médico haciendo una entrevista clínica en persona, no como leyendo ' +
        'un mensaje de chat. Frases fluidas, pequeñas pausas naturales, cercano pero profesional.',
      response_format: 'mp3' as const,
    };
  }

  async synthesizeSpeech(text: string, voice: string): Promise<Buffer> {
    const response = await this.getClient().audio.speech.create(this.speechCreateParams(text, voice));
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Pedido explícito del usuario: que el diálogo de voz sea fluido —
   * antes se esperaba el audio completo de OpenAI (varios segundos)
   * ANTES de mandar un solo byte al teléfono; con esto el controller
   * puede ir transmitiendo a medida que OpenAI genera, en vez de
   * bufferear todo en memoria del servidor primero.
   */
  async synthesizeSpeechStream(text: string, voice: string): Promise<ReadableStream<Uint8Array>> {
    const response = await this.getClient().audio.speech.create(this.speechCreateParams(text, voice));
    if (!response.body) throw new Error('OpenAI no devolvió un stream de audio');
    return response.body;
  }

  async emergencyChat(
    messages: AIChatMessage[],
    caseContext: string,
  ): Promise<AIEmergencyChatResult> {
    const primaryModel = this.config.get<string>('OPENAI_PRIMARY_MODEL')!;
    const fallbackModel = this.config.get<string>('OPENAI_FALLBACK_MODEL');
    const maxOutputTokens = this.config.get<number>('AI_MAX_OUTPUT_TOKENS') ?? 500;
    const systemPrompt = caseContext
      ? `${EMERGENCY_SYSTEM_PROMPT}\n\nCONTEXTO DEL CASO: ${caseContext}`
      : EMERGENCY_SYSTEM_PROMPT;

    let model = primaryModel;
    let completion;
    try {
      completion = await this.getClient().chat.completions.create({
        model: primaryModel,
        max_completion_tokens: maxOutputTokens,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        response_format: { type: 'json_schema', json_schema: EMERGENCY_RESPONSE_JSON_SCHEMA },
      });
    } catch (primaryError) {
      if (!fallbackModel) throw primaryError;
      this.logger.warn(
        `Falló el modelo primario (${primaryModel}) en emergencyChat, reintentando con fallback (${fallbackModel}): ${(primaryError as Error).message}`,
      );
      model = fallbackModel;
      completion = await this.getClient().chat.completions.create({
        model: fallbackModel,
        max_completion_tokens: maxOutputTokens,
        messages: [{ role: 'system', content: systemPrompt }, ...messages],
        response_format: { type: 'json_schema', json_schema: EMERGENCY_RESPONSE_JSON_SCHEMA },
      });
    }

    const rawContent =
      completion.choices[0]?.message?.content ??
      '{"reply":"","escalateToOperator":false}';
    const parsed = JSON.parse(rawContent) as {
      reply: string;
      escalateToOperator: boolean;
    };

    return {
      reply: parsed.reply,
      escalateToOperator: parsed.escalateToOperator,
      provider: this.name,
      model,
    };
  }

  async appHelpChat(
    question: string,
    scriptGuidance?: string,
  ): Promise<AIAppHelpResult> {
    const primaryModel = this.config.get<string>('OPENAI_PRIMARY_MODEL')!;
    const fallbackModel = this.config.get<string>('OPENAI_FALLBACK_MODEL');
    const maxOutputTokens = this.config.get<number>('AI_MAX_OUTPUT_TOKENS') ?? 400;
    const systemPrompt = scriptGuidance
      ? `${APP_HELP_SYSTEM_PROMPT}\n\nGUÍA OPERATIVA CONFIGURABLE (cargada desde la base de conocimiento): ${scriptGuidance}`
      : APP_HELP_SYSTEM_PROMPT;

    let model = primaryModel;
    let completion;
    try {
      completion = await this.getClient().chat.completions.create({
        model: primaryModel,
        max_completion_tokens: maxOutputTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
      });
    } catch (primaryError) {
      if (!fallbackModel) throw primaryError;
      this.logger.warn(
        `Falló el modelo primario (${primaryModel}) en appHelpChat, reintentando con fallback (${fallbackModel}): ${(primaryError as Error).message}`,
      );
      model = fallbackModel;
      completion = await this.getClient().chat.completions.create({
        model: fallbackModel,
        max_completion_tokens: maxOutputTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: question },
        ],
      });
    }

    return {
      answer: completion.choices[0]?.message?.content ?? '',
      provider: this.name,
      model,
    };
  }

  /**
   * Único llamado a OpenAI del modelo Estructurado — solo cuando
   * AIService.tryDeterministicParse() no pudo resolver la respuesta
   * sola. Prompt chico a propósito (una sola pregunta + una sola
   * respuesta, sin historial ni las 250 líneas del SYSTEM_PROMPT del
   * modelo Clásico) — es justamente lo que hace que este modelo sea
   * más barato de comparar en la demo.
   */
  async interpretStructuredAnswer(
    question: { questionText: string; options?: string[] | null; asksDate: boolean },
    answerText: string,
    knownCatalogNames?: string[],
    language: SupportedLang = 'es',
  ): Promise<AIStructuredInterpretResult> {
    const primaryModel = this.config.get<string>('OPENAI_PRIMARY_MODEL')!;
    // Pedido explícito del usuario: "clarification" es lo único de esta
    // respuesta que el viajero llega a leer directamente (si hizo una
    // pregunta en vez de contestar) — tiene que salir en su idioma. NO
    // se traduce "detail": ese valor se guarda en la ficha médica y se
    // compara contra el catálogo, que está en español (mismo criterio
    // que el modelo Clásico, ver chat() más abajo).
    const languageNames: Record<SupportedLang, string> = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés' };
    const languageHint = language !== 'es'
      ? ` El viajero prefiere comunicarse en ${languageNames[language]} — si escribís "clarification", hacelo en ${languageNames[language]} (puede haber contestado en cualquier idioma, entendé la intención igual). "detail" sigue en español, tal cual se explica abajo, sin importar el idioma de la charla.`
      : '';
    const optionsHint = question.options?.length
      ? ` Opciones esperadas: ${question.options.join(', ')} (si el viajero dio otra variante, usala tal cual la dijo).`
      : '';
    const dateHint = question.asksDate
      ? ' Si mencionó una fecha (exacta o aproximada, año solo, etc.), extraela en "dateRaw" tal cual la dijo, y en "date" el formato YYYY-MM-DD SOLO si se puede armar sin inventar el día.'
      : '';
    // Bug real reportado en vivo: "asmi" en vez de "asma" quedaba
    // guardado tal cual, sin corregir — un typo así después ni se
    // puede traducir al compartir la ficha. Se le pasan los nombres YA
    // existentes en el catálogo de este mismo dominio para que
    // normalice contra algo real (nunca inventa un nombre que no
    // pidió el viajero, solo corrige la forma en que quedó escrito).
    const catalogHint = knownCatalogNames?.length
      ? ` Nombres ya cargados en el catálogo de este tipo de antecedente: ${knownCatalogNames.join(', ')}. Si lo que dijo el viajero ` +
        `se parece a uno de estos (aunque lo haya escrito o pronunciado distinto, con errores de tipeo/ortografía), usá EXACTAMENTE ` +
        `ese nombre del catálogo en "detail" — nunca inventes una variante nueva si ya existe uno que corresponde. Si no se parece a ` +
        `ninguno, igual corregí errores de tipeo/ortografía obvios en "detail" (ej. "asmi" -> "Asma", "diabetis" -> "Diabetes") — nunca ` +
        `guardes un nombre mal escrito.`
      : ` Corregí errores de tipeo/ortografía obvios en "detail" (ej. "asmi" -> "Asma") — nunca guardes un nombre mal escrito.`;
    const systemPrompt =
      `Interpretá la respuesta del viajero a esta pregunta puntual de una entrevista de salud: "${question.questionText}".${optionsHint}${dateHint}${catalogHint}${languageHint}\n` +
      `Pedido explícito del usuario: si en vez de contestar el viajero hace una PREGUNTA ("¿qué es eso?", "¿por qué me preguntan ` +
      `esto?") o dice algo que no se entiende como respuesta, no lo trates como un "no" — en "clarification" escribí una respuesta ` +
      `breve (máximo 2 oraciones cortas), clara y en tono cercano a lo que preguntó (si es una pregunta médica general, contestala ` +
      `vos con lo que sepas; si no hay nada que aclarar, dejalo null) y marcá "unclear" en true.\n` +
      `Pedido explícito del usuario: si corregiste una falta de ortografía/tipeo o normalizaste contra el catálogo (ej. "asmi" -> ` +
      `"Asma"), en "correctedFrom" poné EXACTAMENTE el fragmento tal cual lo escribió/dijo el viajero (ej. "asmi") — así se le puede ` +
      `avisar en el chat qué corrigió, en vez de guardarlo sin decir nada. Si "detail" es tal cual lo dijo, sin ningún cambio, dejá ` +
      `"correctedFrom" en null.\n` +
      `Pedido explícito del usuario: si el viajero, EN CUALQUIER IDIOMA y con cualquier frase (no una lista fija — usá tu criterio ` +
      `real), está pidiendo pausar la entrevista y seguir en otro momento (ejemplos de la IDEA, no frases exactas a buscar: "quiero ` +
      `terminar por ahora", "sigamos otro día", "no puedo seguir ahora", "guardá lo que tengo", "let's continue later", "podemos ` +
      `parar acá"), marcá "wantsToPause" en true — en ese caso NO proceses el texto como respuesta a la pregunta (dejá "applicable" ` +
      `en false, "detail"/"dateRaw"/"date" en null). Si el texto es una respuesta real a la pregunta, "wantsToPause" va en false.\n` +
      `Devolvé JSON: "unclear" (true SOLO si el texto no responde ni sí ni no a esta pregunta puntual — ruido, ` +
      `"¿me escuchás?", una frase de otro tema, una pregunta del viajero, algo cortado a la mitad — en ese caso "applicable" debe ir ` +
      `en false y NO se debe asumir que la respuesta fue "no"), "wantsToPause" (ver arriba), "clarification" (ver arriba, o null), ` +
      `"applicable" (con unclear=false y wantsToPause=false: false si contestó que no / no aplica), "detail" (el dato concreto — ` +
      `nombre de la condición/cirugía/medicamento/alergia que mencionó, YA CORREGIDO/normalizado como se explicó arriba, o null si ` +
      `no aplica), "correctedFrom" (ver arriba, o null), "dateRaw", "date".`;

    const startedAt = Date.now();
    const completion = await this.getClient().chat.completions.create({
      model: primaryModel,
      max_completion_tokens: 400,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: answerText },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'structured_answer',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              unclear: { type: 'boolean' },
              wantsToPause: { type: 'boolean' },
              clarification: { type: ['string', 'null'] },
              applicable: { type: 'boolean' },
              detail: { type: ['string', 'null'] },
              correctedFrom: { type: ['string', 'null'] },
              dateRaw: { type: ['string', 'null'] },
              date: { type: ['string', 'null'] },
            },
            required: ['unclear', 'wantsToPause', 'clarification', 'applicable', 'detail', 'correctedFrom', 'dateRaw', 'date'],
          },
        },
      },
    });
    const processingMs = Date.now() - startedAt;

    let parsed: {
      unclear: boolean;
      wantsToPause: boolean;
      clarification: string | null;
      applicable: boolean;
      detail: string | null;
      correctedFrom: string | null;
      dateRaw: string | null;
      date: string | null;
    };
    try {
      parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    } catch {
      // Ante un JSON inválido, mejor pedir que repita que asumir "no" en
      // silencio — mismo criterio que el resto de este método.
      parsed = { unclear: true, wantsToPause: false, clarification: null, applicable: false, detail: null, correctedFrom: null, dateRaw: null, date: null };
    }

    const tokensInput = completion.usage?.prompt_tokens ?? 0;
    const tokensOutput = completion.usage?.completion_tokens ?? 0;
    const estimatedCostUsd =
      (tokensInput / 1000) * APPROX_USD_PER_1K_INPUT_TOKENS +
      (tokensOutput / 1000) * APPROX_USD_PER_1K_OUTPUT_TOKENS;

    return {
      ...parsed,
      provider: this.name,
      model: primaryModel,
      tokensInput,
      tokensOutput,
      estimatedCostUsd,
      processingMs,
    };
  }

  /**
   * Pedido explícito del usuario: "cuando se informan varios
   * medicamentos la app debería grabarlos todos por separado no en
   * una sola línea, además debería validar correctamente el nombre" —
   * equivalente de interpretStructuredAnswer pero para la pregunta
   * abierta de medicamentos (proposal_type MEDICATION): en vez de un
   * solo "detail", devuelve una LISTA — un ítem por droga mencionada,
   * cada una corregida/normalizada contra el catálogo (mismo criterio
   * que "asmi" -> "Asma" para condiciones).
   */
  async interpretMedicationAnswer(
    answerText: string,
    knownMedicationNames?: string[],
    language: SupportedLang = 'es',
  ): Promise<AIMedicationSplitResult> {
    const primaryModel = this.config.get<string>('OPENAI_PRIMARY_MODEL')!;
    const languageNames: Record<SupportedLang, string> = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés' };
    const languageHint = language !== 'es'
      ? ` El viajero prefiere comunicarse en ${languageNames[language]} — si escribís "clarification", hacelo en ${languageNames[language]}. Los nombres de medicamentos en "name" siguen en español/nombre genérico internacional, sin importar el idioma de la charla.`
      : '';
    const catalogHint = knownMedicationNames?.length
      ? ` Medicamentos ya cargados en el catálogo: ${knownMedicationNames.join(', ')}. Si lo que dijo el viajero se parece a uno de estos ` +
        `(aunque lo haya escrito o pronunciado distinto, con errores de tipeo/ortografía), usá EXACTAMENTE ese nombre del catálogo en ` +
        `"name" — nunca inventes una variante nueva si ya existe uno que corresponde. Si no se parece a ninguno, igual corregí errores ` +
        `de tipeo/ortografía obvios (ej. "metformna" -> "Metformina", "enalapri" -> "Enalapril") — nunca guardes un nombre mal escrito.`
      : ` Corregí errores de tipeo/ortografía obvios (ej. "metformna" -> "Metformina") — nunca guardes un nombre mal escrito.`;
    const systemPrompt =
      `Interpretá la respuesta del viajero a la pregunta "¿Qué medicamentos toma de forma habitual?" en una entrevista de salud.${catalogHint}${languageHint}\n` +
      `Pedido explícito del usuario: si mencionó VARIOS medicamentos juntos (ej. "tomo enalapril, metformina y aspirina"), separalos — un ` +
      `objeto por cada droga en el array "medications", NUNCA los combines en un solo nombre. Si mencionó dosis/marca junto al nombre ` +
      `(ej. "enalapril 10mg"), dejá eso afuera de "name" (solo el nombre de la droga) — no hay campo de dosis acá, se pregunta aparte.\n` +
      `Pedido explícito del usuario: si en vez de contestar el viajero hace una PREGUNTA o dice algo que no se entiende como respuesta, ` +
      `en "clarification" escribí una respuesta breve (máximo 2 oraciones) y marcá "unclear" en true — "medications" queda vacío en ese caso.\n` +
      `Pedido explícito del usuario: si el viajero, EN CUALQUIER IDIOMA, está pidiendo pausar la entrevista y seguir en otro momento, ` +
      `marcá "wantsToPause" en true — "medications" queda vacío en ese caso, no proceses el texto como respuesta.\n` +
      `Si el texto dice claramente que no toma ningún medicamento, "applicable" en false y "medications" vacío. Si sí menciona alguno, ` +
      `"applicable" en true.\n` +
      `Para cada medicamento, "correctedFrom" es el fragmento tal cual lo escribió/dijo el viajero SOLO si "name" corrigió algo — null si ` +
      `"name" es tal cual lo dijo, sin cambios.\n` +
      `Pedido explícito del usuario: si para ALGÚN medicamento mencionó desde cuándo lo toma o cuándo se lo prescribieron (ej. "tomo ` +
      `enalapril desde 2020", "metformina, me la recetaron en marzo del año pasado"), guardá eso en "dateRaw" (el texto tal cual lo dijo, ` +
      `para ESE medicamento nomás) y en "date" si pudiste convertirlo a fecha completa (con día 1 si faltaba precisión) — null en ambos si ` +
      `no dijo nada de fecha para ese medicamento en particular. Nunca inventes una fecha ni la copies de otro medicamento distinto.\n` +
      `Devolvé JSON: "unclear", "wantsToPause", "clarification" (o null), "applicable", "medications" (array de {name, correctedFrom, ` +
      `dateRaw, date}, vacío si no aplica).`;

    const startedAt = Date.now();
    const completion = await this.getClient().chat.completions.create({
      model: primaryModel,
      max_completion_tokens: 500,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: answerText },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'medication_split',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              unclear: { type: 'boolean' },
              wantsToPause: { type: 'boolean' },
              clarification: { type: ['string', 'null'] },
              applicable: { type: 'boolean' },
              medications: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    name: { type: 'string' },
                    correctedFrom: { type: ['string', 'null'] },
                    dateRaw: { type: ['string', 'null'] },
                    date: { type: ['string', 'null'] },
                  },
                  required: ['name', 'correctedFrom', 'dateRaw', 'date'],
                },
              },
            },
            required: ['unclear', 'wantsToPause', 'clarification', 'applicable', 'medications'],
          },
        },
      },
    });
    const processingMs = Date.now() - startedAt;

    let parsed: {
      unclear: boolean;
      wantsToPause: boolean;
      clarification: string | null;
      applicable: boolean;
      medications: { name: string; correctedFrom: string | null; dateRaw: string | null; date: string | null }[];
    };
    try {
      parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    } catch {
      // Ante un JSON inválido, mejor pedir que repita que asumir "no
      // toma nada" en silencio — mismo criterio que interpretStructuredAnswer.
      parsed = { unclear: true, wantsToPause: false, clarification: null, applicable: false, medications: [] };
    }

    const tokensInput = completion.usage?.prompt_tokens ?? 0;
    const tokensOutput = completion.usage?.completion_tokens ?? 0;
    const estimatedCostUsd =
      (tokensInput / 1000) * APPROX_USD_PER_1K_INPUT_TOKENS +
      (tokensOutput / 1000) * APPROX_USD_PER_1K_OUTPUT_TOKENS;

    return {
      ...parsed,
      provider: this.name,
      model: primaryModel,
      tokensInput,
      tokensOutput,
      estimatedCostUsd,
      processingMs,
    };
  }

  /**
   * Pedido explícito del usuario: al compartir la Ficha de Salud,
   * poder elegir el idioma en que la ve el médico — traduce el JSON
   * completo de SharedProfileView (buildSharedProfile) manteniendo
   * EXACTAMENTE la misma forma (mismas claves, mismo shape de
   * arrays) — solo cambian los valores de texto legibles (nombres de
   * alergias/condiciones/medicamentos, notas). IDs, fechas, números y
   * booleanos quedan tal cual. Se llama UNA sola vez al generar el
   * link (ver MeSharesController.createDoctorInvite), nunca en cada
   * vista — por eso no hace falta json_schema estricto acá (el shape
   * varía según qué secciones tenga cargadas cada viajero).
   */
  async translateSharedProfile(
    profile: Record<string, unknown>,
    language: string,
  ): Promise<Record<string, unknown>> {
    const primaryModel = this.config.get<string>('OPENAI_PRIMARY_MODEL')!;
    const languageNames: Record<string, string> = {
      en: 'inglés', pt: 'portugués', fr: 'francés', es: 'español',
    };
    const systemPrompt =
      `Traducí al ${languageNames[language] ?? language} el siguiente JSON de una ficha médica, ` +
      `para que la lea un médico. Devolvé el MISMO JSON, con las mismas claves y la misma estructura ` +
      `(mismos arrays, mismos objetos) — traducí SOLO los valores de texto legible (nombres de alergias, ` +
      `condiciones, medicamentos, cirugías, implantes, notas, indicaciones). NUNCA traduzcas ni modifiques ` +
      `IDs (campos que terminan en "Id"), fechas, números, booleanos, ni nombres propios de personas. ` +
      // Bug real reportado en vivo: statusCode/severity son códigos fijos
      // en inglés que el frontend compara literalmente (ej. filtra
      // "CHRONIC" vs otras, colorea "SEVERE"/"CRITICAL" en rojo) — si se
      // traducen ("CHRONIC" -> "CRÓNICO") esas comparaciones se rompen
      // en silencio y la condición "desaparece" de su sección.
      `NUNCA traduzcas tampoco los campos "statusCode", "severity", "proposalType" ni ningún campo que ` +
      `termine en "Code" o en "Type" — son códigos fijos en inglés (ej. "CHRONIC", "SEVERE", "MODERATE"), ` +
      `no texto para mostrar; dejalos exactamente como vienen, sin cambiar mayúsculas ni nada. ` +
      `Si un valor es null, dejalo null.`;

    const completion = await this.getClient().chat.completions.create({
      model: primaryModel,
      max_completion_tokens: 3000,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(profile) },
      ],
      response_format: { type: 'json_object' },
    });

    try {
      return JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    } catch (error) {
      this.logger.error(`JSON inválido de translateSharedProfile: ${(error as Error).message}`);
      return profile;
    }
  }

  /**
   * Pedido explícito del usuario: mix de tabla curada + IA con
   * búsqueda web real para completar/actualizar el botón "Info del
   * destino" de un viaje (ver AIService.getDestinationHealthInfo).
   * A diferencia de todo lo demás en este provider, usa la API de
   * Responses (no Chat Completions) porque es la única que soporta la
   * tool nativa `web_search` de OpenAI — sin esto el modelo solo
   * podría contestar con su conocimiento general, sin poder confirmar
   * si algo cambió recientemente (brotes, alertas vigentes, etc.).
   * Devuelve `sources` (URLs citadas) para que el dato sea auditable —
   * nunca se muestra como una afirmación propia sin respaldo.
   */
  async lookupDestinationHealthInfo(countryName: string): Promise<AIDestinationHealthInfoResult> {
    const primaryModel = this.config.get<string>('OPENAI_PRIMARY_MODEL')!;
    const startedAt = Date.now();

    const response = await this.getClient().responses.create(
      {
        model: primaryModel,
        tools: [{ type: 'web_search' }],
        input:
          `Buscá en la web información vigente (priorizá fuentes de los últimos 12 meses: ministerios de salud, ` +
          `OMS/PAHO, cancillerías, CDC) de salud y seguridad para un viajero que visita ${countryName}. Cubrí: ` +
          `vacunas recomendadas o exigidas, riesgos sanitarios vigentes (brotes activos, enfermedades transmitidas ` +
          `por mosquitos u otras, calidad del agua), alertas de seguridad vigentes (no historia general, situación ` +
          `actual), y tips prácticos para el viaje. Sé conservador: si no encontrás algo confiable y reciente sobre ` +
          `algún punto, decilo explícitamente en vez de inventar o generalizar. Nunca des recomendaciones médicas ` +
          `personalizadas — solo información general del destino. Redactá en español, tono breve y claro (no uses ` +
          `formato markdown).`,
        text: {
          format: {
            type: 'json_schema',
            name: 'destination_health_info',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                vaccinations: { type: ['string', 'null'] },
                healthRisks: { type: ['string', 'null'] },
                securityAlerts: { type: ['string', 'null'] },
                generalTips: { type: ['string', 'null'] },
                sources: { type: 'array', items: { type: 'string' } },
              },
              required: ['vaccinations', 'healthRisks', 'securityAlerts', 'generalTips', 'sources'],
            },
          },
        },
      },
      // Bug real reportado en vivo: sin timeout explícito, una búsqueda
      // web colgada (ej. problema de red, o el modelo no soporta bien
      // la tool) dejaba el spinner de la app girando más de un minuto
      // sin ningún feedback ("no pasa nada"). Mejor fallar rápido y
      // claro que dejar esperando indefinidamente.
      { timeout: 20_000 },
    );
    const processingMs = Date.now() - startedAt;

    let parsed: {
      vaccinations: string | null;
      healthRisks: string | null;
      securityAlerts: string | null;
      generalTips: string | null;
      sources: string[];
    };
    try {
      parsed = JSON.parse(response.output_text ?? '{}');
    } catch (error) {
      this.logger.error(`JSON inválido de lookupDestinationHealthInfo: ${(error as Error).message}`);
      parsed = { vaccinations: null, healthRisks: null, securityAlerts: null, generalTips: null, sources: [] };
    }

    const tokensInput = response.usage?.input_tokens ?? 0;
    const tokensOutput = response.usage?.output_tokens ?? 0;
    const estimatedCostUsd =
      (tokensInput / 1000) * APPROX_USD_PER_1K_INPUT_TOKENS +
      (tokensOutput / 1000) * APPROX_USD_PER_1K_OUTPUT_TOKENS +
      APPROX_USD_PER_WEB_SEARCH_CALL;

    return {
      ...parsed,
      provider: this.name,
      model: primaryModel,
      tokensInput,
      tokensOutput,
      estimatedCostUsd,
      processingMs,
    };
  }

  /**
   * Pedido explícito del usuario: la tercera forma de cargar la Ficha
   * de Salud (formulario de una sola pantalla) valida TODO el texto
   * libre en UN solo llamado — no uno por campo, para no multiplicar
   * costo/latencia en un formulario con varias filas. "kind" (ej.
   * "medicamento", "cirugía", "alergia", "detalle de antecedente") le
   * da contexto a la IA sobre qué tipo de texto está corrigiendo.
   */
  async validateFreeTextEntries(
    entries: { id: string; text: string; kind: string; knownNames?: string[] }[],
  ): Promise<AIFreeTextValidationResult> {
    const primaryModel = this.config.get<string>('OPENAI_PRIMARY_MODEL')!;
    if (!entries.length) {
      return { entries: [], provider: this.name, model: primaryModel, tokensInput: 0, tokensOutput: 0, estimatedCostUsd: 0, processingMs: 0 };
    }
    const systemPrompt =
      `Vas a revisar una lista de textos escritos por un viajero en un formulario de ficha médica — cada uno tiene un ` +
      `"kind" que indica qué tipo de dato es (ej. "medicamento", "cirugía", "implante", "alergia", "detalle de antecedente"). ` +
      `Para cada entrada, corregí SOLO errores de tipeo/ortografía obvios (ej. "metformna" -> "Metformina", "amoxicilna" -> ` +
      `"Amoxicilina") — nunca cambies el significado ni inventes información que no está. ` +
      `Cuando la entrada trae "knownNames" (nombres YA existentes en el catálogo real del sistema para ese tipo de dato), ` +
      `es PRIORITARIO: si "text" se parece a uno de esos nombres (aunque tenga errores de tipeo, mayúsculas distintas, o ` +
      `esté abreviado), "corrected" tiene que quedar IDÉNTICO a ese nombre conocido — esto evita que se creen registros ` +
      `duplicados en el catálogo por una simple diferencia de tipeo. Caso real reportado: cuando "kind" es "cirugía" o ` +
      `"implante", los viajeros suelen nombrar el procedimiento por la ENFERMEDAD que lo motivó en vez del procedimiento ` +
      `en sí (ej. escriben "apendicitis" queriendo decir que le operaron el apéndice) — si eso pasa y "knownNames" tiene el ` +
      `procedimiento estándar para esa afección (ej. "Apendicectomía"), corregí a ese nombre del procedimiento, no dejes el ` +
      `nombre de la enfermedad. Si no se parece a ningún "knownNames", corregí solo la ` +
      `ortografía general (quedará pendiente de revisión en el catálogo, eso es esperable). Si ya está bien escrito y ya ` +
      `coincide con un "knownNames", "corrected" es idéntico a "text" y "wasCorrected" en false. Marcá "invalid" en true SOLO ` +
      `si el texto no tiene ningún sentido como dato médico real (ej. ruido, una sola letra, ecos de la voz como "sí", ` +
      `"hola") — en ese caso "corrected" puede quedar igual al original. Devolvé un array con un objeto por cada "id" ` +
      `recibido, en el mismo orden.`;
    const userPayload = JSON.stringify(entries.map((e) => ({ id: e.id, text: e.text, kind: e.kind, knownNames: e.knownNames?.length ? e.knownNames : undefined })));

    const startedAt = Date.now();
    const completion = await this.getClient().chat.completions.create({
      model: primaryModel,
      max_completion_tokens: 300 + entries.length * 60,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPayload },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'free_text_validation',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: {
              entries: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    id: { type: 'string' },
                    corrected: { type: 'string' },
                    wasCorrected: { type: 'boolean' },
                    invalid: { type: 'boolean' },
                  },
                  required: ['id', 'corrected', 'wasCorrected', 'invalid'],
                },
              },
            },
            required: ['entries'],
          },
        },
      },
    });
    const processingMs = Date.now() - startedAt;

    let parsed: { entries: { id: string; corrected: string; wasCorrected: boolean; invalid: boolean }[] };
    try {
      parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    } catch {
      // Ante un JSON inválido, mejor devolver todo tal cual (sin
      // corrección) que bloquear el guardado del formulario.
      parsed = { entries: entries.map((e) => ({ id: e.id, corrected: e.text, wasCorrected: false, invalid: false })) };
    }

    const tokensInput = completion.usage?.prompt_tokens ?? 0;
    const tokensOutput = completion.usage?.completion_tokens ?? 0;
    const estimatedCostUsd =
      (tokensInput / 1000) * APPROX_USD_PER_1K_INPUT_TOKENS +
      (tokensOutput / 1000) * APPROX_USD_PER_1K_OUTPUT_TOKENS;

    return {
      ...parsed,
      provider: this.name,
      model: primaryModel,
      tokensInput,
      tokensOutput,
      estimatedCostUsd,
      processingMs,
    };
  }
}

/** Descarta las claves null que sobran del schema (uno de los dos "modos" del objeto data). */
function cleanProposal(p: {
  proposalType: AIProposalType;
  confidence: number;
  data: Record<string, unknown>;
}): AIProposalCandidate {
  const entries = Object.entries(p.data).filter(
    ([, v]) => v !== null && v !== undefined,
  );
  return {
    proposalType: p.proposalType,
    confidence: p.confidence,
    data: Object.fromEntries(entries) as unknown as AIProposalCandidate['data'],
  };
}
