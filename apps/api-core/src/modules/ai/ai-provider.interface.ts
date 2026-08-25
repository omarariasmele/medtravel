/** Pedido explícito del usuario: los asistentes de IA tienen que poder hablar en el idioma preferido del viajero (core.persons.preferred_lang), no solo español. Definido acá (no en ai.service.ts) para que tanto el servicio como los providers lo importen sin ciclo. */
export type SupportedLang = 'es' | 'en' | 'pt' | 'fr';

export type AIChatRole = 'user' | 'assistant' | 'system';

export interface AIChatMessage {
  role: AIChatRole;
  content: string;
}

export type AIProposalType =
  | 'MEDICATION'
  | 'ALLERGY'
  | 'CONDITION'
  | 'SURGERY'
  | 'VITALS'
  | 'LAB_RESULT'
  | 'IMPLANT_DEVICE'
  | 'TREATMENT';

/**
 * Datos de la propuesta en el MISMO shape que CreateMedicationDto/
 * CreateAllergyDto (modules/me/dto) — así el paso de confirmación
 * inserta en clinical.medications/allergies sin transformar nada.
 */
export interface AIMedicationProposalData {
  genericName: string;
  brandName?: string;
  /** Mismo criterio que diagnosedDateRaw/diagnosedDate (CONDITION) — texto tal cual lo dijo + fecha convertida si se pudo. */
  prescribedDateRaw?: string | null;
  prescribedDate?: string | null;
  isCurrent?: boolean;
  notes?: string;
  /** Mismo motivo que AIConditionProposalData.sourceQuestionId — evita volver a preguntar en una consulta de seguimiento. */
  sourceQuestionId?: string;
}

export interface AIAllergyProposalData {
  allergenName: string;
  allergenType: 'MEDICATION' | 'FOOD' | 'ENVIRONMENTAL' | 'OTHER';
  severity: 'MILD' | 'MODERATE' | 'SEVERE' | 'CRITICAL';
  notes?: string;
  /** Mismo motivo que AIConditionProposalData.sourceQuestionId. */
  sourceQuestionId?: string;
}

/**
 * diagnosedDateRaw: la fecha tal cual la dijo el viajero ("hace como
 * 10 años", "2015"), siempre presente si mencionó algo temporal.
 * diagnosedDate: la misma fecha normalizada a ISO cuando se pudo — si
 * solo dio año/mes, se completa al 1° de ese período (nunca se inventa
 * el día si no lo dijo).
 *
 * statusCode: gap real encontrado en vivo — "Neumonía" quedaba
 * guardada igual que "Diabetes" (siempre ACTIVE), sin distinguir una
 * enfermedad crónica/en curso de una ya resuelta en el pasado. El
 * dominio CONDITION_STATUS ya tenía el valor CHRONIC sembrado, nunca
 * se usaba. También resuelve "diabetes" vs "diabetes tipo 2": es UNA
 * condición con un tipo, no dos — el tipo va en conditionName o notes,
 * nunca como una segunda propuesta separada.
 */
export interface AIConditionProposalData {
  conditionName: string;
  statusCode?: 'CHRONIC' | 'ACTIVE' | 'RESOLVED' | 'IN_REMISSION';
  diagnosedDateRaw?: string;
  diagnosedDate?: string;
  notes?: string;
  /**
   * Bug real reportado en vivo: el modelo Estructurado volvía a
   * preguntar "¿enfermedad pulmonar crónica?" aunque ya hubiera
   * confirmado "Asma" ahí — el chequeo de "ya lo tengo" comparaba el
   * código de la pregunta contra el código del catálogo resuelto
   * (ej. CHRONIC_LUNG_DISEASE vs ASTHMA, nunca coinciden en preguntas
   * "paraguas" que agrupan varias enfermedades puntuales). Guardar acá
   * qué ai.interview_questions.id originó este antecedente resuelve
   * esto de raíz — ver clinical.conditions.source_question_id.
   */
  sourceQuestionId?: string;
}

export interface AIImplantDeviceProposalData {
  deviceName: string;
  implantedAtRaw?: string;
  implantedAt?: string;
  notes?: string;
  /** Mismo motivo que AIConditionProposalData.sourceQuestionId. */
  sourceQuestionId?: string;
}

/**
 * Pedido explícito del usuario: "para el caso de diálisis, como la
 * tenemos que tratar ya que es un tratamiento" — un TRATAMIENTO
 * (diálisis, quimioterapia, radioterapia, etc.) es un concepto médico
 * distinto de una enfermedad/CONDITION: la enfermedad de fondo se
 * pregunta aparte, esto es el procedimiento/terapia en curso o pasado.
 * Mismo shape que AIConditionProposalData (statusCode reutiliza el
 * dominio CONDITION_STATUS — ACTIVE/CHRONIC cubren "en curso",
 * RESOLVED cubre "ya terminado" — y sourceQuestionId para el mismo
 * chequeo anti-duplicado por pregunta).
 */
export interface AITreatmentProposalData {
  treatmentName: string;
  statusCode?: 'CHRONIC' | 'ACTIVE' | 'RESOLVED' | 'IN_REMISSION';
  startedAtRaw?: string;
  startedAt?: string;
  notes?: string;
  sourceQuestionId?: string;
}

export interface AISurgeryProposalData {
  procedureName: string;
  performedDateRaw?: string;
  performedDate?: string;
  notes?: string;
  /** Mismo motivo que AIConditionProposalData.sourceQuestionId. */
  sourceQuestionId?: string;
}

export interface AIVitalsProposalData {
  weightKg?: number;
  heightCm?: number;
  bloodPressureSystolic?: number;
  bloodPressureDiastolic?: number;
  birthDateRaw?: string;
  birthDate?: string;
  /** Código del dominio GENDER (params.catalog_values) — resuelto a UUID en confirmProposal. */
  genderCode?: string;
  /** Código del dominio BLOOD_TYPE — idem. */
  bloodTypeCode?: string;
}

/**
 * clinical.lab_results ya tenía columnas para los valores más comunes
 * (gap encontrado en vivo: el prompt le pedía a la IA "anotar" estudios
 * recientes, pero no existía ningún proposalType para guardarlos —
 * la IA decía "anoto" y nunca quedaba nada grabado). Se cubren los
 * campos con columna propia más frecuentes + customValues para
 * cualquier otro resultado que el viajero mencione sin columna
 * dedicada (ej. "protrombina 95%").
 */
export interface AILabResultProposalData {
  labName?: string;
  performedDateRaw?: string;
  performedDate?: string;
  hemoglobin?: number;
  hematocrit?: number;
  whiteBloodCells?: number;
  platelets?: number;
  glucoseFasting?: number;
  hba1c?: number;
  totalCholesterol?: number;
  hdlCholesterol?: number;
  ldlCholesterol?: number;
  triglycerides?: number;
  creatinine?: number;
  ptInr?: number;
  aptt?: number;
  customValues?: { name: string; value: string }[];
  notes?: string;
}

export interface AIProposalCandidate {
  proposalType: AIProposalType;
  confidence: number;
  data:
    | AIMedicationProposalData
    | AIAllergyProposalData
    | AIConditionProposalData
    | AISurgeryProposalData
    | AIVitalsProposalData
    | AILabResultProposalData
    | AIImplantDeviceProposalData
    | AITreatmentProposalData;
}

export interface AIChatResult {
  /** Respuesta conversacional en español para mostrar al viajero. */
  reply: string;
  proposals: AIProposalCandidate[];
  /**
   * true SOLO en el turno de cierre, cuando la IA ya cubrió los 29
   * antecedentes + datos básicos + estudios y presentó el resumen
   * final pidiendo UNA confirmación de todo lo hablado — pedido
   * explícito del usuario de no confirmar antecedente por antecedente.
   */
  interviewComplete: boolean;
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  processingMs: number;
  estimatedCostUsd: number;
}

export interface AIEmergencyChatResult {
  /** Respuesta conversacional en español para mostrar al viajero en el chat del caso. */
  reply: string;
  /** true si la IA decide que hace falta un operador humano — dispara escalate_case_priority. */
  escalateToOperator: boolean;
  provider: string;
  model: string;
}

export interface AIAppHelpResult {
  answer: string;
  provider: string;
  model: string;
}

/**
 * Resultado del único llamado "chico" a OpenAI que hace el modelo
 * Estructurado (AIService.structuredIntakeChat) — solo cuando una
 * respuesta no se pudo parsear determinísticamente. Prompt acotado a
 * una sola pregunta/respuesta, no a toda la charla — mucho más barato
 * que un turno del modelo Clásico, por diseño (pedido explícito del
 * usuario: poder comparar costo real entre los dos modelos).
 */
export interface AIStructuredInterpretResult {
  /** false si el viajero contestó que no / no aplica — no genera proposal. */
  applicable: boolean;
  /**
   * Bug real reportado en vivo (modo Estructurado por voz): si la
   * persona dice algo que no responde ni sí ni no a la pregunta (ruido
   * de fondo mal transcripto, "¿me escuchás?", una frase de otro tema),
   * antes se lo trataba igual que un "no" y la entrevista avanzaba
   * sola, sin haber contestado nada — quedaba la sensación de "no me
   * escuchó". Con `unclear=true` el turno NO avanza: se le vuelve a
   * pedir que conteste sí o no en vez de asumir que no tiene el
   * antecedente.
   */
  unclear: boolean;
  /**
   * Pedido explícito del usuario: entender la intención de "quiero
   * pausar y seguir después" de forma real (cualquier idioma, cualquier
   * forma de decirlo — "terminemos por hoy", "sigamos otro día", "no
   * puedo ahora"), en vez de mantener una lista de frases fijas en la
   * app que hay que ampliar cada vez que alguien lo dice distinto.
   * Aprovecha el MISMO llamado que ya se hace para interpretar una
   * respuesta ambigua — no agrega un llamado nuevo. Cuando es true, el
   * llamador guarda todo lo confirmado hasta ahora y corta la
   * entrevista, sin tratar el texto como respuesta a la pregunta
   * actual.
   */
  wantsToPause: boolean;
  /**
   * Bug real reportado en vivo: la viajera le dijo a la IA que
   * cerrara la charla SIN guardar nada de lo hablado, y la IA guardó
   * igual — porque la única intención de cierre que existía era
   * `wantsToPause` (pausar y GUARDAR lo confirmado hasta ahora), sin
   * ninguna forma de distinguir "guardá y pausemos" de "cancelá todo,
   * no guardes nada". Mismo criterio que wantsToPause (cualquier
   * idioma, cualquier forma de decirlo — "cancelá todo", "no guardes
   * nada de esto", "cerrá sin grabar"): cuando es true, el llamador
   * descarta (REJECTED) todo lo pendiente de esta conversación en vez
   * de confirmarlo.
   */
  wantsToDiscard: boolean;
  /**
   * Pedido explícito del usuario: si en vez de contestar la persona
   * hace una pregunta ("¿qué es eso?", "¿por qué me preguntan esto?")
   * o dice algo que no se entiende bien, la IA tiene que poder
   * responderle ahí mismo (una aclaración breve) en vez de solo repetir
   * la pregunta original en seco. Se usa junto con unclear=true — el
   * turno no avanza, pero el mensaje que se le devuelve empieza con
   * esta aclaración antes de repetir la pregunta.
   */
  clarification: string | null;
  /**
   * Pedido explícito del usuario: si escribió/dijo "asmi" y se guardó
   * como "Asma" sin más, después no se enteraba de la corrección. Acá
   * va el fragmento tal cual lo escribió/dijo SOLO cuando `detail`
   * corrigió una falta de ortografía o normalizó contra el catálogo —
   * null si `detail` es simplemente lo que dijo, sin cambios. El
   * llamador arma el aviso ("Anoté X, interpretando que dijiste Y") en
   * vez de corregir en silencio.
   */
  correctedFrom: string | null;
  /**
   * Pedido explícito del usuario: "no podemos registrar cualquier cosa
   * en la base de datos porque... el médico que atiende la emergencia
   * no va a entender que dice la ficha de salud" — false SOLO cuando
   * `detail` NO corresponde a ningún concepto médico real y reconocible
   * (enfermedad, medicamento, alergia, cirugía, implante o resultado de
   * análisis) — texto inventado, una palabra suelta sin sentido médico,
   * algo de otro dominio. Con `applicable=true` pero `plausible=false`,
   * el llamador NO guarda nada — pide que aclare, igual que `unclear`.
   */
  plausible: boolean;
  /**
   * Pedido explícito del usuario (mismo pedido que `plausible`): true
   * cuando `detail` SÍ es un concepto médico real (`plausible=true`)
   * pero de un tipo DISTINTO al que pide esta pregunta puntual — caso
   * real: "colesterol alto" contestado a una pregunta de enfermedad es
   * real, pero es un resultado de análisis (LAB_RESULT), no una
   * condición (CONDITION). El llamador no lo guarda bajo el tipo fijo
   * de esta pregunta — lo reclasifica vía interpretOpenEndedAnswer y
   * vuelve a pedir la respuesta a ESTA pregunta puntual.
   */
  categoryMismatch: boolean;
  detail: string | null;
  dateRaw: string | null;
  date: string | null;
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  processingMs: number;
}

/**
 * Pedido explícito del usuario: al cargar un viaje, poder consultar
 * (con un botón) vacunas/riesgos/alertas de seguridad del destino —
 * mix pedido: tabla curada (ai.destination_health_info) como base +
 * este método (búsqueda web real vía la tool `web_search` de OpenAI)
 * para completar países que falten o refrescar contenido vencido.
 * `sources` son las URLs citadas por el modelo — se guardan para que
 * el dato sea auditable, nunca se muestra como afirmación propia sin
 * respaldo.
 */
export interface AIDestinationHealthInfoResult {
  vaccinations: string | null;
  healthRisks: string | null;
  securityAlerts: string | null;
  generalTips: string | null;
  sources: string[];
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  processingMs: number;
}

/**
 * Pedido explícito del usuario: "cuando se informan varios
 * medicamentos la app debería grabarlos todos por separado no en una
 * sola línea, además debería validar correctamente el nombre" — bug
 * confirmado: el modelo Estructurado guardaba TODO el texto libre de
 * la respuesta como un único genericName, sin separar por droga ni
 * corregir errores de tipeo/ortografía (a diferencia de CONDITION/
 * ALLERGY, que ya pasan por interpretStructuredAnswer con corrección).
 * Este método es el equivalente para medicamentos: separa la
 * respuesta en una lista de nombres, cada uno corregido/normalizado.
 */
export interface AIMedicationSplitResult {
  /** false SOLO si, pese al chequeo determinístico previo, la IA determina que no aplica (ej. "no tomo nada" con una frase no prevista). */
  applicable: boolean;
  unclear: boolean;
  wantsToPause: boolean;
  /** Ver AIStructuredInterpretResult.wantsToDiscard — mismo criterio, para la pregunta de medicamentos. */
  wantsToDiscard: boolean;
  clarification: string | null;
  /** Un ítem por medicamento mencionado — nunca un solo string con varios juntos. */
  medications: {
    name: string;
    /** Igual que AIStructuredInterpretResult.correctedFrom — el fragmento tal cual lo escribió/dijo, SOLO si "name" corrigió algo. */
    correctedFrom: string | null;
    /**
     * Bug real reportado en vivo: "debería registrarse con su fecha de
     * prescripción" — antes este método no extraía ninguna fecha, así
     * que el medicamento se guardaba siempre sin fecha aunque el
     * viajero la hubiera dicho. Igual criterio que dateRaw/date del
     * resto del modelo: texto tal cual lo dijo + fecha convertida si se
     * pudo, null si no la mencionó (mejor sin fecha que no guardarlo).
     */
    dateRaw: string | null;
    date: string | null;
    /** Ver AIStructuredInterpretResult.plausible — mismo criterio, por medicamento (la lista puede traer varios, uno solo puede ser inventado/no-medicamento). */
    plausible: boolean;
    /** Ver AIStructuredInterpretResult.categoryMismatch — real pero no es un medicamento (ej. "colesterol alto" mezclado en la lista). */
    categoryMismatch: boolean;
  }[];
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  processingMs: number;
}

/**
 * Pedido explícito del usuario: "si el usuario no tiene cargado su
 * peso y altura y grupo sanguíneo, el estructurado lo debería
 * solicitar" — a diferencia de CONDITION/SURGERY/etc. (un detalle +
 * una fecha), esta pregunta especial pide hasta 3 valores juntos en
 * una sola respuesta ("peso 80, altura 175, grupo O positivo"), así
 * que necesita su propio intérprete en vez de reusar
 * interpretStructuredAnswer. Solo se piden los campos que
 * efectivamente faltan (ver AIService.getMissingVitalsQuestion) — los
 * otros dos quedan en null sin que eso cuente como "no contestó".
 */
export interface AIVitalsInterpretResult {
  /** Igual criterio que AIStructuredInterpretResult.unclear — ruido/pregunta del viajero en vez de una respuesta real. */
  unclear: boolean;
  clarification: string | null;
  wantsToPause: boolean;
  wantsToDiscard: boolean;
  /** kg, o null si no lo mencionó (o no se le preguntó por ese campo). */
  weightKg: number | null;
  /** cm — la IA normaliza "1.75m"/"1,75"/"175" al mismo valor en centímetros. */
  heightCm: number | null;
  /** Código del dominio BLOOD_TYPE (ej. "O_POS") — null si no lo mencionó o no supo decirlo. */
  bloodTypeCode: string | null;
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  processingMs: number;
}

/**
 * Pedido explícito del usuario: la tercera forma de cargar la Ficha de
 * Salud (formulario de una sola pantalla) valida TODO el texto libre
 * que escribió el viajero en UN solo llamado a la IA (no uno por
 * campo, para no multiplicar costo/latencia en un formulario con
 * varias filas de medicamentos/cirugías/etc.) — corrige ortografía y
 * marca si algo no tiene sentido como para guardarlo (ej. texto vacío
 * de sentido, ruido).
 */
export interface AIFreeTextValidationResult {
  entries: {
    id: string;
    corrected: string;
    /** true solo si "corrected" difiere de lo que escribió el viajero — para poder avisarle qué se corrigió. */
    wasCorrected: boolean;
    /** true si el texto no tiene sentido como para guardarlo (ruido, vacío de contenido) — el llamador decide qué hacer (pedir de nuevo, descartar la fila). */
    invalid: boolean;
  }[];
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  processingMs: number;
}

/**
 * Pedido explícito del usuario: "todo el sistema de IA del celular
 * debería poder manejar bien todas las enfermedades existentes o
 * análisis o estudios, o medicamentos, no podemos limitarlo a lo
 * básico" — Estructurado/Formulario caminan una lista FIJA de ~26
 * preguntas (ai.interview_questions), a diferencia de Clásico
 * (Realtime), que reconoce cualquier antecedente porque es la IA la
 * que decide, no una lista precargada. Esta pregunta de cierre (la
 * ÚLTIMA de la lista, ver proposed-open-ended-question.sql) es la
 * puerta de escape: en vez de forzar el detalle a UN proposalType fijo
 * (como el resto de las preguntas, atadas a su proposal_type de la
 * fila), interpreta la respuesta libre y puede generar CUALQUIER
 * cantidad de antecedentes de CUALQUIER tipo (condición, cirugía,
 * medicamento, alergia, implante, resultado de estudio) en una sola
 * respuesta — mismo criterio de validación que el resto del sistema
 * (nunca adivina, corrige términos médicos con confirmación, exige
 * valor real para LAB_RESULT, etc.), reusando el mismo esquema de
 * datos que ya usan Clásico y el chat principal (PROPOSAL_DATA_SCHEMA).
 */
export interface AIOpenEndedInterpretResult {
  /** false si el viajero contestó que no tiene nada más para agregar. */
  applicable: boolean;
  /** Ver AIStructuredInterpretResult.unclear — mismo criterio acá. */
  unclear: boolean;
  clarification: string | null;
  /** Uno o más antecedentes reconocidos en la respuesta — vacío si applicable=false o unclear=true. */
  items: AIProposalCandidate[];
  provider: string;
  model: string;
  tokensInput: number;
  tokensOutput: number;
  estimatedCostUsd: number;
  processingMs: number;
}

/**
 * Contrato único que toca OpenAI (u otro proveedor a futuro) — el
 * resto del backend nunca importa el SDK del proveedor directamente
 * (MTA-103 §10: "AI Gateway como único módulo que toca el proveedor").
 */
export interface AIProvider {
  readonly name: string;
  synthesizeSpeech(text: string, voice: string, speed?: number): Promise<Buffer>;
  /**
   * Pedido explícito del usuario: que el diálogo de voz sea fluido —
   * hoy se espera el audio completo (varios segundos de síntesis en
   * OpenAI) antes de mandar UN byte al teléfono. Devuelve el stream
   * crudo tal cual lo va generando OpenAI, para que el controller lo
   * transmita al cliente a medida que llega en vez de bufferear todo
   * primero (ver MeHealthAssistantController.speech).
   *
   * `speed`: pedido explícito del usuario ("el asistente estructurado
   * habla muy despacio") — parámetro nativo de la API de OpenAI (0.25
   * a 4.0, default 1.0), antes nunca se mandaba. Ver assistant.tts_
   * speech_rate (params.app_settings).
   */
  synthesizeSpeechStream(text: string, voice: string, speed?: number): Promise<ReadableStream<Uint8Array>>;
  chat(
    messages: AIChatMessage[],
    personContext?: string,
    scriptGuidance?: string,
    /** Pedido explícito del usuario: el modelo Clásico responde en el idioma preferido del viajero — 'es' por default. */
    language?: SupportedLang,
  ): Promise<AIChatResult>;
  emergencyChat(
    messages: AIChatMessage[],
    caseContext: string,
  ): Promise<AIEmergencyChatResult>;
  appHelpChat(question: string, scriptGuidance?: string, language?: SupportedLang): Promise<AIAppHelpResult>;
  interpretStructuredAnswer(
    question: { questionText: string; options?: string[] | null; asksDate: boolean },
    answerText: string,
    /**
     * Pedido explícito del usuario: si escribe/dice "asmi" en vez de
     * "asma", tiene que quedar guardado bien — un typo así, después,
     * ni se puede traducir al compartir la ficha. Nombres YA existentes
     * en el catálogo del mismo dominio (ver catalog_domain_code de la
     * pregunta) para que el modelo normalice contra algo real en vez
     * de inventar una corrección — nunca inventa un nombre nuevo, solo
     * corrige ortografía si no hay ningún catálogo cargado todavía.
     */
    knownCatalogNames?: string[],
    /** Pedido explícito del usuario: "clarification" (lo único que se le muestra al viajero acá) tiene que salir en su idioma preferido — 'es' por default. "detail" sigue normalizado contra el catálogo en español SIEMPRE, sin importar el idioma (ver comentario en el prompt del provider). */
    language?: SupportedLang,
  ): Promise<AIStructuredInterpretResult>;
  translateSharedProfile(
    profile: Record<string, unknown>,
    language: string,
  ): Promise<Record<string, unknown>>;
  lookupDestinationHealthInfo(countryName: string): Promise<AIDestinationHealthInfoResult>;
  interpretMedicationAnswer(
    answerText: string,
    knownMedicationNames?: string[],
    language?: SupportedLang,
  ): Promise<AIMedicationSplitResult>;
  /** Ver AIOpenEndedInterpretResult — pregunta de cierre de Estructurado/Formulario, cualquier tipo de antecedente en una sola respuesta. */
  interpretOpenEndedAnswer(
    answerText: string,
    language?: SupportedLang,
  ): Promise<AIOpenEndedInterpretResult>;
  /** Ver AIVitalsInterpretResult — turno especial de peso/altura/grupo sanguíneo al arrancar Estructurado. */
  interpretVitalsAnswer(
    answerText: string,
    /** Qué campos faltan y hay que pedir (ver AIService.getMissingVitalsQuestion) — la IA no debe inventar un valor para un campo que ya está cargado y no se preguntó. */
    askedFields: { weight: boolean; height: boolean; bloodType: boolean },
    language?: SupportedLang,
  ): Promise<AIVitalsInterpretResult>;
  validateFreeTextEntries(
    entries: { id: string; text: string; kind: string; knownNames?: string[] }[],
  ): Promise<AIFreeTextValidationResult>;
  /**
   * Motor nuevo del modo Clásico (voz en tiempo real, OpenAI Realtime
   * API) — pedido explícito del usuario tras varios bugs de voz en
   * vivo (cuelgues de reconocimiento, ventana de silencio corta,
   * pérdida de correcciones). Genera un token efímero de corta
   * duración (`POST /v1/realtime/client_secrets`) que el celular usa
   * para conectarse DIRECTO a OpenAI vía WebRTC — nuestra API key real
   * nunca sale del servidor. `personContext` sigue el mismo criterio
   * que `chat()` (qué ya está cargado, para no re-preguntarlo).
   */
  createRealtimeSession(
    personContext: string | undefined,
    language: SupportedLang | undefined,
    voiceConfig: AIRealtimeVoiceConfig,
  ): Promise<AIRealtimeSessionResult>;
}

/**
 * Pedido explícito del usuario: toda la parametrización del motor
 * Realtime editable desde admin-web (params.app_settings, ver
 * proposed-realtime-voice-settings.sql) — mismo criterio que
 * assistant.tts_* para el motor de texto.
 */
export interface AIRealtimeVoiceConfig {
  voice: string;
  /** Si no viene, el provider usa su propio default (env var / 'gpt-realtime'). */
  model?: string;
  silenceDurationMs: number;
  vadThreshold: number;
  prefixPaddingMs: number;
}

export interface AIRealtimeSessionResult {
  /** Token efímero (`ek_...`) — el celular lo manda como Bearer al conectar por WebRTC, nunca la API key real. */
  clientSecret: string;
  /** Unix timestamp (segundos) en que el token deja de poder usarse para ABRIR una sesión nueva — una sesión ya abierta puede seguir. */
  expiresAt: number;
  model: string;
}
