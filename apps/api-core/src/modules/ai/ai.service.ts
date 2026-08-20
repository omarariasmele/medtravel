import { Injectable, BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueryFailedError, QueryRunner } from 'typeorm';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { mapPgError, isSkippableConflict } from '@common/database/pg-error.mapper';
import { CatalogResolutionService } from '@modules/params/catalog-resolution.service';

import { AIAllergyProposalData, AIChatMessage, AIProposalCandidate, SupportedLang } from './ai-provider.interface';
import { OpenAIProvider } from './providers/openai.provider';

export const FALLBACK_ANSWER_HEALTH_CHAT =
  'El asistente de carga de ficha médica todavía no está configurado en este ambiente. ' +
  'Mientras tanto, podés cargar tus alergias y medicamentos manualmente desde "Salud".';

export const FALLBACK_ANSWER_APP_HELP =
  'El asistente de IA todavía no está configurado en este ambiente. ' +
  'Mientras tanto: completá tu ficha médica desde "Salud" (alergias, condiciones ' +
  'y medicamentos son los datos más importantes ante una urgencia), cargá tu ' +
  'documento en "Perfil" para que el sistema te asocie a tu póliza automáticamente, ' +
  'y usá "Compartir" para generar un QR que el médico que te atienda pueda leer sin necesitar cuenta.';

export const FALLBACK_ONBOARDING_MESSAGE =
  '¡Bienvenido/a a MedTravelApp! Para que estés listo/a ante cualquier imprevisto, ' +
  'te recomendamos completar tu Historial de Salud (alergias, medicamentos y condiciones), ' +
  'agregar tus Contactos de emergencia, y revisar que tu Perfil esté al día.';

interface HealthChatOutcome {
  conversationId: string;
  reply: string;
  configured: boolean;
  /**
   * true SOLO en el turno de cierre de la entrevista — la app usa esto
   * para recién ahí mostrar el botón/voz de "confirmar todo" (pedido
   * explícito del usuario: no confirmar antecedente por antecedente).
   */
  interviewComplete: boolean;
  proposals: Array<{
    id: string;
    proposalType: string;
    confidence: number;
    data: Record<string, unknown>;
  }>;
  limitReached?:
    'USER_DAILY' | 'PLATFORM_DAILY_BUDGET' | 'PLATFORM_MONTHLY_BUDGET';
}

/**
 * Pedido explícito del usuario: "con solo decir diabetes tipo 2 la IA
 * le podría preguntar usted tiene registrado diabetes tipo 1, es
 * correcto el cambio" — cuando el modelo Clásico o Estructurado
 * proponen una condición que choca con trg_prevent_duplicate_condition_by_question
 * (ver proposed-prevent-duplicate-condition-by-question.sql), en vez
 * de perder el dato en silencio se captura acá el conflicto para que
 * confirmAllProposalsInTx lo devuelva con el detalle necesario
 * (existingConditionId/newConditionName) y la app pueda preguntarle al
 * viajero si quiere reemplazar el valor viejo por el nuevo — reutiliza
 * el mismo PATCH /me/health-assistant/conditions/:id ya construido
 * para la corrección manual del Formulario.
 */
class ConditionConflictError extends Error {
  constructor(
    readonly existingConditionId: string,
    readonly existingConditionName: string,
    readonly newConditionName: string,
    readonly newDateRaw?: string,
  ) {
    super('condition_conflict');
  }
}

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly provider: OpenAIProvider,
    private readonly txManager: TenantTransactionManager,
    private readonly catalogResolution: CatalogResolutionService,
  ) {}

  /**
   * Voz de OpenAI (gpt-4o-mini-tts) en vez del motor del teléfono —
   * pedido explícito del usuario: "quiero que la voz sea totalmente
   * natural... no que parezca un chat". Si la IA está deshabilitada o
   * el llamado falla, el caller (mobile) cae al motor del dispositivo —
   * por eso acá se propaga el error tal cual, sin fallback silencioso.
   */
  async synthesizeSpeech(text: string, voice: string): Promise<Buffer> {
    if (!this.config.get<boolean>('AI_ENABLED')) {
      throw new BadRequestException('El asistente de IA no está habilitado');
    }
    return this.provider.synthesizeSpeech(text, voice);
  }

  /** Ver AIProvider.synthesizeSpeechStream — versión en streaming del método de arriba, para diálogo de voz más fluido. */
  async synthesizeSpeechStream(text: string, voice: string): Promise<ReadableStream<Uint8Array>> {
    if (!this.config.get<boolean>('AI_ENABLED')) {
      throw new BadRequestException('El asistente de IA no está habilitado');
    }
    return this.provider.synthesizeSpeechStream(text, voice);
  }

  /**
   * Pedido explícito del usuario: botón "Info del destino" en el
   * viaje — vacunas, riesgos de salud y alertas de seguridad. Mix
   * pedido: primero la tabla curada (ai.destination_health_info,
   * rápida y gratis); si no hay fila para ese país (o se pide
   * `forceRefresh`, ej. desde admin-web), se completa con
   * lookupDestinationHealthInfo (IA + búsqueda web real) y se guarda
   * el resultado — así el próximo viajero que pregunte por el mismo
   * país ya lo encuentra sin volver a pagar el costo de la búsqueda.
   */
  async getDestinationHealthInfo(
    countryId: string,
    forceRefresh = false,
  ): Promise<{
    countryId: string;
    vaccinations: string | null;
    healthRisks: string | null;
    securityAlerts: string | null;
    generalTips: string | null;
    source: 'manual' | 'ai_web_search';
    sourceNotes: string | null;
    updatedAt: Date;
  }> {
    return this.txManager.runInTransaction(async (queryRunner) => {
      if (!forceRefresh) {
        const [existing] = await queryRunner.query(
          `SELECT * FROM ai.destination_health_info WHERE country_id = $1`,
          [countryId],
        );
        // Bug real reportado en vivo: una fila creada vacía a mano
        // desde admin-web (país cargado sin completar ningún campo,
        // ej. mientras se prueba la pantalla) contaba como "ya hay
        // datos" y nunca disparaba la búsqueda con IA — el país
        // quedaba sin ninguna info, silenciosamente. Solo cuenta como
        // "ya cargado" si tiene al menos un campo con contenido.
        if (existing && (existing.vaccinations || existing.health_risks || existing.security_alerts || existing.general_tips)) {
          return this.mapDestinationHealthInfoRow(existing);
        }
      }

      if (!this.config.get<boolean>('AI_ENABLED')) {
        throw new BadRequestException(
          'Todavía no hay información cargada para este destino, y el asistente de IA no está habilitado para buscarla.',
        );
      }

      const [country] = await queryRunner.query(
        `SELECT label_es FROM params.catalog_values WHERE id = $1`,
        [countryId],
      );
      if (!country) throw new BadRequestException('País de destino inválido.');

      let result: Awaited<ReturnType<typeof this.provider.lookupDestinationHealthInfo>>;
      try {
        result = await this.provider.lookupDestinationHealthInfo(country.label_es);
      } catch (error) {
        // La búsqueda web puede fallar por motivos ajenos al viajero
        // (permisos de la API key, rate limit, corte de red) — mejor
        // un mensaje claro que un 500 pelado, y sin guardar nada a
        // medias en la tabla.
        this.logger.error(`lookupDestinationHealthInfo falló para "${country.label_es}": ${(error as Error).message}`);
        throw new BadRequestException(
          'No pudimos buscar información actualizada de este destino en este momento — probá de nuevo más tarde.',
        );
      }
      const sourceNotes = result.sources.length ? result.sources.join('\n') : null;

      const [row] = await queryRunner.query(
        `INSERT INTO ai.destination_health_info
           (country_id, vaccinations, health_risks, security_alerts, general_tips, source, source_notes)
         VALUES ($1, $2, $3, $4, $5, 'ai_web_search', $6)
         ON CONFLICT (country_id) DO UPDATE SET
           vaccinations = EXCLUDED.vaccinations,
           health_risks = EXCLUDED.health_risks,
           security_alerts = EXCLUDED.security_alerts,
           general_tips = EXCLUDED.general_tips,
           source = EXCLUDED.source,
           source_notes = EXCLUDED.source_notes
         RETURNING *`,
        [countryId, result.vaccinations, result.healthRisks, result.securityAlerts, result.generalTips, sourceNotes],
      );

      // No es una conversación de un viajero puntual (ai.messages
      // exige conversation_id/person_id NOT NULL con RLS atado al
      // viajero autenticado) — es contenido de referencia global, así
      // que el costo de esta búsqueda queda solo en el log del
      // servidor, no en el panel de consumo de IA por viajero.
      this.logger.log(
        `lookupDestinationHealthInfo país=${country.label_es} costo≈$${result.estimatedCostUsd.toFixed(4)} ` +
        `tokens_in=${result.tokensInput} tokens_out=${result.tokensOutput} ms=${result.processingMs}`,
      );

      return this.mapDestinationHealthInfoRow(row);
    });
  }

  private mapDestinationHealthInfoRow(row: {
    country_id: string;
    vaccinations: string | null;
    health_risks: string | null;
    security_alerts: string | null;
    general_tips: string | null;
    source: 'manual' | 'ai_web_search';
    source_notes: string | null;
    updated_at: Date;
  }) {
    return {
      countryId: row.country_id,
      vaccinations: row.vaccinations,
      healthRisks: row.health_risks,
      securityAlerts: row.security_alerts,
      generalTips: row.general_tips,
      source: row.source,
      sourceNotes: row.source_notes,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Pedido explícito del usuario: compartir la Ficha de Salud en el
   * idioma que elija el médico — ver MeSharesController.createDoctorInvite.
   * Si la IA está deshabilitada, devuelve el perfil sin traducir (mejor
   * mostrar en español que romper la generación del link).
   */
  async translateSharedProfile(
    profile: Record<string, unknown>,
    language: string,
  ): Promise<Record<string, unknown>> {
    if (!this.config.get<boolean>('AI_ENABLED')) return profile;
    return this.provider.translateSharedProfile(profile, language);
  }

  /**
   * IA en el chat de emergencia — pedido explícito del usuario: "el
   * primer contacto deberia manejarlo la IA... y en caso de que
   * necesite contactarse con un operador, este lo derivara". Escribe
   * directo en operations.chat_messages (el MISMO transcript que ve un
   * operador humano, no un log aparte) vía la función SECURITY DEFINER
   * insert_system_chat_message — este método corre en background
   * (disparado por events.gateway.ts o por MeEmergencyCasesController
   * al crear el caso), sin un JWT real en vuelo, así que no puede pasar
   * por el INSERT normal con RLS de case_participants.
   *
   * Se abstiene por completo (devuelve null) si ya hay un operador
   * humano activo en el caso — la IA nunca "compite" hablando a la vez
   * que una persona real.
   */
  async respondInEmergencyChat(
    caseId: string,
    opts: { isGreeting?: boolean } = {},
  ): Promise<Record<string, unknown> | null> {
    if (!this.config.get<boolean>('AI_ENABLED')) return null;

    return this.txManager.runInTransaction(async (queryRunner) => {
      const [caseRow] = await queryRunner.query(
        `SELECT ec.id, ec.initial_description, ec.patient_symptoms, ec.patient_conscious,
                ch.id AS channel_id, m.person_id
         FROM operations.emergency_cases ec
         JOIN operations.chat_channels ch ON ch.case_id = ec.id
         JOIN core.members m ON m.id = ec.member_id
         WHERE ec.id = $1`,
        [caseId],
      );
      if (!caseRow) return null;

      // "Comprometido" = escribió al menos un mensaje, no solo abrir el
      // chat para mirar — un operador queda como case_participant activo
      // apenas hace join_case (events.gateway.ts::tryAutoJoinAsOperator),
      // así que chequear la membresía sola apagaba la IA para siempre con
      // solo entrar a ver el caso, sin que el operador interviniera
      // (bug real reportado en vivo: "el chat no tiene continuidad").
      const [operatorEngaged] = await queryRunner.query(
        `SELECT 1 FROM operations.chat_messages cm
         JOIN params.catalog_values cv ON cv.id = cm.sender_type_id
         WHERE cm.case_id = $1 AND cv.code = 'OPERATOR'
         LIMIT 1`,
        [caseId],
      );
      if (operatorEngaged) return null;

      const contextParts: string[] = [];
      if (opts.isGreeting) {
        contextParts.push(
          'ES EL PRIMER MENSAJE DE ESTE CASO — tu apertura tiene que dejar claro que el viajero ' +
            'se contactó con el asistente de IA de la app, que lo vas a ayudar en todo lo que puedas, ' +
            'y que si hace falta un operador humano lo vas a derivar.',
        );
      }
      if (caseRow.initial_description) {
        contextParts.push(`descripción inicial reportada: ${caseRow.initial_description}`);
      }
      if (caseRow.patient_symptoms) {
        contextParts.push(`síntomas reportados: ${caseRow.patient_symptoms}`);
      }
      if (caseRow.patient_conscious === false) {
        contextParts.push('el viajero reportó que el paciente NO está consciente');
      }

      const personContext = await this.getPersonContext(queryRunner, caseRow.person_id);
      if (personContext) contextParts.push(`ficha médica ya cargada: ${personContext}`);

      // scope EMERGENCY_CHAT — ver gap #73 (KB_ENTRY_SCOPE, tabla puente
      // ai.knowledge_base_entry_scopes: una entrada puede aplicar a
      // varios asistentes a la vez).
      const kbEntries = await queryRunner.query(
        `SELECT k.title, k.content
         FROM ai.knowledge_base_entries k
         JOIN ai.knowledge_base_entry_scopes s ON s.entry_id = k.id
         JOIN params.catalog_values cv ON cv.id = s.scope_id
         WHERE k.active = TRUE AND cv.code = 'EMERGENCY_CHAT'
         ORDER BY k.created_at`,
      );
      if (kbEntries.length) {
        contextParts.push(
          `información interna de referencia: ${kbEntries
            .map((k: { title: string; content: string }) => `${k.title}: ${k.content}`)
            .join(' | ')}`,
        );
      }

      const history = await queryRunner.query(
        `SELECT cm.content, cv.code AS sender_type_code
         FROM operations.chat_messages cm
         JOIN params.catalog_values cv ON cv.id = cm.sender_type_id
         WHERE cm.case_id = $1 AND cm.content IS NOT NULL
         ORDER BY cm.sent_at ASC`,
        [caseId],
      );
      const messages: AIChatMessage[] = history.map(
        (h: { content: string; sender_type_code: string }) => ({
          role: h.sender_type_code === 'AI_ASSISTANT' ? 'assistant' : 'user',
          content: h.content,
        }),
      );

      const result = await this.provider.emergencyChat(messages, contextParts.join('; '));

      const [inserted] = await queryRunner.query(
        `SELECT * FROM operations.insert_system_chat_message($1, $2, 'AI_ASSISTANT', 'Asistente de IA', $3)`,
        [caseRow.channel_id, caseId, result.reply],
      );

      if (result.escalateToOperator) {
        await queryRunner.query(
          `SELECT operations.escalate_case_priority($1, 'HIGH')`,
          [caseId],
        );
      }

      return inserted;
    });
  }

  async healthChat(
    personId: string,
    conversationId: string | undefined,
    question: string,
  ): Promise<HealthChatOutcome> {
    if (!this.config.get<boolean>('AI_ENABLED')) {
      return {
        conversationId: conversationId ?? '',
        reply: FALLBACK_ANSWER_HEALTH_CHAT,
        configured: false,
        interviewComplete: false,
        proposals: [],
      };
    }

    return this.txManager.runInTransaction(async (queryRunner) => {
      const convId =
        conversationId ?? (await this.startConversation(queryRunner, personId));

      const limitReached = await this.checkLimits(queryRunner, personId);
      if (limitReached) {
        return {
          conversationId: convId,
          reply: '',
          configured: true,
          interviewComplete: false,
          proposals: [],
          limitReached,
        };
      }

      await this.insertMessage(queryRunner, {
        conversationId: convId,
        personId,
        sender: 'USER',
        message: question,
        provider: 'n/a',
        model: null,
      });

      const history = await this.loadHistory(queryRunner, convId);
      const personContext = await this.getPersonContext(queryRunner, personId);
      const pendingContext = await this.getConversationPendingContext(queryRunner, convId);
      const combinedContext = [personContext, pendingContext].filter(Boolean).join('. ') || undefined;
      const scriptGuidance = await this.getHealthAssistantScriptGuidance(queryRunner);
      const language = await this.getPersonLanguage(queryRunner, personId);
      const result = await this.provider.chat(history, combinedContext, scriptGuidance, language);

      const [assistantMessageRow] = await this.insertMessage(queryRunner, {
        conversationId: convId,
        personId,
        sender: 'ASSISTANT',
        message: result.reply,
        provider: result.provider,
        model: result.model,
        tokensInput: result.tokensInput,
        tokensOutput: result.tokensOutput,
        estimatedCostUsd: result.estimatedCostUsd,
        processingMs: result.processingMs,
      });

      const proposalRows = await this.insertProposals(
        queryRunner,
        convId,
        assistantMessageRow.id,
        personId,
        result.proposals,
        result.provider,
        result.model,
      );

      return {
        conversationId: convId,
        reply: result.reply,
        configured: true,
        interviewComplete: result.interviewComplete,
        proposals: proposalRows,
      };
    });
  }

  // ══════════════════════════════════════════════════════════
  // MODELO FORMULARIO — pedido explícito del usuario: una TERCERA forma
  // de cargar la Ficha de Salud, junto al Clásico (charla libre) y el
  // Estructurado (pregunta por pregunta) — un formulario de una sola
  // pantalla donde el viajero completa TODO antes de guardar. A
  // diferencia de los otros dos, acá no hay turnos: se manda el
  // formulario entero, se valida el texto libre en UN solo llamado a
  // la IA (barato, no uno por campo) y se insertan todos los proposals
  // de una — el guardado final reusa el MISMO confirmAllProposals que
  // ya usan los otros dos modelos.
  // ══════════════════════════════════════════════════════════

  private static parseFormDate(raw?: string): string | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    // DD/MM/AAAA o DD-MM-AAAA
    const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (dmy) {
      const [, d, m, y] = dmy;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    // Solo año
    const yearOnly = trimmed.match(/^(\d{4})$/);
    if (yearOnly) return `${yearOnly[1]}-01-01`;
    // AAAA-MM-DD (ya en ISO)
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    return undefined;
  }

  /**
   * Bug real reportado en vivo: "¿por qué sale fecha declarada por el
   * viajero, si es lo mismo que Diagnosticada?" — applyConfirmedProposal
   * agregaba esa nota SIEMPRE que había un diagnosedDateRaw, sin
   * importar si ya tenía precisión completa de día (en cuyo caso es
   * exactamente el mismo dato repetido dos veces). La nota solo tiene
   * sentido cuando el texto original NO especifica un día exacto (ej.
   * "2022" o "diciembre 2001") — ahí sí se pierde precisión al forzar
   * un DATE completo y vale la pena conservar lo que realmente dijo.
   */
  private static hasFullDatePrecision(raw: string): boolean {
    const trimmed = raw.trim();
    return /^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(trimmed) || /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  }

  /**
   * Pedido explícito del usuario: "cuando dice desde los cinco años, la
   * IA debería corregirlo identificando la fecha que corresponda según
   * la fecha de nacimiento declarada — no debería poner 'desde los 5
   * años' en ningún lado". parseFormDate no reconoce estas expresiones
   * (no son una fecha en sí), pero el sistema YA sabe la fecha de
   * nacimiento del viajero — alcanza con sumarle la edad mencionada.
   * Mismo criterio de precisión que el resto (año exacto, sin inventar
   * mes/día): AAAA-01-01 del año en que cumplió esa edad.
   */
  private static resolveAgeRelativeDate(raw: string, birthDate: string | null | undefined): string | undefined {
    if (!birthDate) return undefined;
    const normalized = AIService.stripAccents(raw.trim().toLowerCase());
    const match = normalized.match(/(?:desde los|desde que tenia|a los|cuando tenia|con)\s+(\d{1,3})\s*(?:anos|ano)\b/);
    if (!match) return undefined;
    const age = parseInt(match[1], 10);
    if (!Number.isFinite(age) || age < 0 || age > 130) return undefined;
    const birthYear = new Date(birthDate).getUTCFullYear();
    if (!Number.isFinite(birthYear)) return undefined;
    return `${birthYear + age}-01-01`;
  }

  /** parseFormDate + fallback a fecha relativa por edad (ver resolveAgeRelativeDate). */
  private static parseFormDateWithAge(raw: string | undefined, birthDate: string | null | undefined): string | undefined {
    const direct = AIService.parseFormDate(raw);
    if (direct) return direct;
    if (!raw) return undefined;
    return AIService.resolveAgeRelativeDate(raw, birthDate);
  }

  /**
   * Bug real reportado en vivo: "Redoxón/Reliveran no quedan alineados
   * como los demás medicamentos" — el Formulario guardaba la dosis
   * SIEMPRE como texto libre en notes ("Dosis: 100 mg"), nunca en las
   * columnas estructuradas dose_amount/dose_unit_id que sí usa el alta
   * manual de admin-web — por eso se veían distinto (una fila abajo del
   * nombre, en vez de en la misma línea). Si el texto matchea un
   * patrón "número + unidad conocida" (ej. "100 mg", "10 ml"), se
   * separa en las columnas estructuradas, igual que el resto; si no
   * matchea (dosis descripta de otra forma), sigue cayendo a notes como
   * antes, nunca se pierde el dato.
   */
  private static parseDoseText(raw?: string): { amount: number; unitCode: string } | undefined {
    if (!raw) return undefined;
    const match = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*(mg|mcg|ml|ui|gotas?|comprimidos?|parche)\b/i);
    if (!match) return undefined;
    const amount = parseFloat(match[1].replace(',', '.'));
    if (!Number.isFinite(amount)) return undefined;
    const unitByWord: Record<string, string> = {
      mg: 'MG', mcg: 'MCG', ml: 'ML', ui: 'UI',
      gota: 'GOTAS', gotas: 'GOTAS',
      comprimido: 'COMPRIMIDOS', comprimidos: 'COMPRIMIDOS',
      parche: 'PARCHE',
    };
    const unitCode = unitByWord[match[2].toLowerCase()];
    return unitCode ? { amount, unitCode } : undefined;
  }

  // Bug real reportado en vivo: "Glucemia" aparecía dos veces en un
  // mismo estudio — la IA guarda el valor en la columna estructurada
  // (glucose_fasting) Y ADEMÁS lo repite en customValues con un
  // nombre libre ("Glucemia"), y como cada uno se muestra en su
  // propio chip, se ve duplicado. Se descarta cualquier customValue
  // cuyo nombre matchee (por sinónimo, sin acentos) un campo
  // estructurado que YA tiene valor — así el dato queda una sola vez,
  // en la columna estructurada, que es la fuente de verdad.
  private static readonly LAB_FIELD_SYNONYMS: Record<string, string[]> = {
    hemoglobin: ['hemoglobina'],
    hematocrit: ['hematocrito'],
    whiteBloodCells: ['globulos blancos', 'leucocitos'],
    platelets: ['plaquetas'],
    glucoseFasting: ['glucemia', 'glucosa', 'glicemia'],
    hba1c: ['hba1c', 'hemoglobina glicosilada', 'hemoglobina glicada'],
    totalCholesterol: ['colesterol total'],
    hdlCholesterol: ['colesterol hdl', 'hdl'],
    ldlCholesterol: ['colesterol ldl', 'ldl'],
    triglycerides: ['trigliceridos'],
    creatinine: ['creatinina'],
    ptInr: ['pt-inr', 'inr', 'protrombina'],
    aptt: ['aptt', 'ttpa'],
  };

  private static dedupeLabCustomValues(
    data: Record<string, unknown>,
    customValues: { name: string; value: string }[],
  ): { name: string; value: string }[] {
    const redundantNames = new Set<string>();
    for (const [field, synonyms] of Object.entries(AIService.LAB_FIELD_SYNONYMS)) {
      if (data[field] != null) synonyms.forEach((s) => redundantNames.add(s));
    }
    if (redundantNames.size === 0) return customValues;
    return customValues.filter((cv) => {
      const normalized = AIService.stripAccents(cv.name.toLowerCase()).trim();
      return !redundantNames.has(normalized);
    });
  }

  /**
   * El modelo Estructurado y el Formulario ya guardan source_question_id
   * al crear una condición (viene directo de la pregunta que la
   * originó). El modelo Clásico (charla libre) no tiene ese concepto —
   * nunca supo de qué pregunta viene lo que el viajero tipeó — así que
   * trg_prevent_duplicate_condition_by_question nunca actuaba para él
   * (ver proposed-prevent-duplicate-condition-by-question.sql). Acá se
   * reconstruye el vínculo buscando, entre las preguntas CONDITION con
   * opciones (ej. los tipos de diabetes — las de sí/no simple no tienen
   * "options" y no aplica), cuál tiene una opción que coincide con el
   * nombre ya resuelto contra CONDITION_CATALOG — así el Clásico queda
   * protegido igual que los otros dos modelos, sin tocarlos.
   */
  private async resolveSourceQuestionIdByLabel(
    queryRunner: QueryRunner,
    labelEs: string,
  ): Promise<string | undefined> {
    const questions: { id: string; options: string[] | null }[] = await queryRunner.query(
      `SELECT id, options FROM ai.interview_questions
       WHERE active = TRUE AND proposal_type = 'CONDITION' AND options IS NOT NULL`,
    );
    const normalized = AIService.stripAccents(labelEs.toLowerCase()).trim();
    for (const q of questions) {
      if ((q.options ?? []).some((o) => AIService.stripAccents(o.toLowerCase()).trim() === normalized)) {
        return q.id;
      }
    }
    return undefined;
  }

  async submitHealthForm(
    personId: string,
    form: {
      basic: { birthDateRaw?: string; sexCode?: string; weightKg?: number; heightCm?: number; bloodTypeCode?: string };
      conditions: { questionId?: string; label: string; dateRaw?: string; detail?: string }[];
      allergies: { name: string; allergenType: string; severity: string }[];
      medications: { name: string; dose?: string; sinceRaw?: string }[];
      surgeries: { name: string; dateRaw?: string }[];
      implants: { name: string; dateRaw?: string }[];
    },
  ): Promise<{
    conversationId: string;
    proposals: { id: string; proposalType: string; confidence: number; data: Record<string, unknown> }[];
    corrections: { original: string; corrected: string }[];
  }> {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const [convRow] = await queryRunner.query(
        `INSERT INTO ai.conversations (person_id, conversation_type, intake_model)
         VALUES ($1, 'HEALTH_DATA_CAPTURE', 'FORM')
         RETURNING id`,
        [personId],
      );
      const conversationId = convRow.id;

      const [userMessage] = await this.insertMessage(queryRunner, {
        conversationId,
        personId,
        sender: 'USER',
        message: 'Formulario de ficha de salud completado.',
        provider: 'n/a',
        model: null,
      });

      // Un solo llamado a la IA para validar TODO el texto libre del
      // formulario (nunca uno por campo) — solo si hay algo para
      // revisar, para no gastar un llamado con el formulario vacío.
      //
      // Pedido explícito del usuario: la IA ya corregía "enfermedades"
      // contra el catálogo real (ver getKnownCatalogNames, usado en el
      // modelo Estructurado) — acá se aplica el MISMO criterio a
      // medicamentos/alergias/cirugías/implantes, para que "asmi" no
      // quede como "Asmi" sino que se ajuste al nombre ya existente en
      // params.catalog_values — así CatalogResolutionService.resolveOrCreate
      // matchea la entrada existente en vez de crear un DRAFT duplicado.
      const freeTextEntries: { id: string; text: string; kind: string; knownNames?: string[] }[] = [];
      const knownNamesByDomain = new Map<string, string[]>();
      const knownNamesFor = async (domainCode: string): Promise<string[]> => {
        if (!knownNamesByDomain.has(domainCode)) {
          knownNamesByDomain.set(domainCode, await this.getKnownCatalogNames(queryRunner, domainCode));
        }
        return knownNamesByDomain.get(domainCode)!;
      };
      form.conditions.forEach((c, i) => {
        if (c.detail?.trim()) freeTextEntries.push({ id: `condition_${i}`, text: c.detail, kind: 'detalle de antecedente' });
      });
      for (let i = 0; i < form.allergies.length; i++) {
        const a = form.allergies[i];
        if (a.name?.trim()) freeTextEntries.push({ id: `allergy_${i}`, text: a.name, kind: 'alergia', knownNames: await knownNamesFor('ALLERGEN') });
      }
      for (let i = 0; i < form.medications.length; i++) {
        const m = form.medications[i];
        if (m.name?.trim()) freeTextEntries.push({ id: `medication_${i}`, text: m.name, kind: 'medicamento', knownNames: await knownNamesFor('MEDICATION') });
      }
      for (let i = 0; i < form.surgeries.length; i++) {
        const s = form.surgeries[i];
        if (s.name?.trim()) freeTextEntries.push({ id: `surgery_${i}`, text: s.name, kind: 'cirugía', knownNames: await knownNamesFor('SURGERY_CATALOG') });
      }
      for (let i = 0; i < form.implants.length; i++) {
        const im = form.implants[i];
        if (im.name?.trim()) freeTextEntries.push({ id: `implant_${i}`, text: im.name, kind: 'implante', knownNames: await knownNamesFor('IMPLANT_TYPE') });
      }

      let correctedById = new Map<string, string>();
      let validationProvider = 'form';
      let validationModel = 'form';
      const corrections: { original: string; corrected: string }[] = [];

      if (freeTextEntries.length > 0) {
        const validation = await this.provider.validateFreeTextEntries(freeTextEntries);
        validationProvider = validation.provider;
        validationModel = validation.model;
        await this.insertMessage(queryRunner, {
          conversationId,
          personId,
          sender: 'ASSISTANT',
          message: '(validación IA del formulario)',
          provider: validation.provider,
          model: validation.model,
          tokensInput: validation.tokensInput,
          tokensOutput: validation.tokensOutput,
          estimatedCostUsd: validation.estimatedCostUsd,
          processingMs: validation.processingMs,
        });
        for (const entry of validation.entries) {
          if (entry.invalid) continue;
          correctedById.set(entry.id, entry.corrected);
          const original = freeTextEntries.find((e) => e.id === entry.id)?.text;
          if (entry.wasCorrected && original) corrections.push({ original, corrected: entry.corrected });
        }
      }
      const resolvedText = (id: string, fallback: string) => correctedById.get(id) ?? fallback;

      const candidates: AIProposalCandidate[] = [];

      const { basic } = form;
      if (basic.birthDateRaw || basic.sexCode || basic.weightKg || basic.heightCm || basic.bloodTypeCode) {
        candidates.push({
          proposalType: 'VITALS',
          confidence: 0.95,
          data: {
            birthDateRaw: basic.birthDateRaw,
            birthDate: AIService.parseFormDate(basic.birthDateRaw),
            genderCode: basic.sexCode,
            weightKg: basic.weightKg,
            heightCm: basic.heightCm,
            bloodTypeCode: basic.bloodTypeCode,
          },
        });
      }

      // Pedido explícito del usuario: "cuando dice desde los cinco
      // años, la IA debería identificar la fecha según la fecha de
      // nacimiento" — se necesita la fecha de nacimiento YA cargada del
      // viajero para poder resolver esas expresiones relativas a edad
      // (ver parseFormDateWithAge/resolveAgeRelativeDate).
      const [personRow] = await queryRunner.query(
        `SELECT birth_date FROM core.persons WHERE id = $1`,
        [personId],
      );
      const birthDate = personRow?.birth_date
        ? (personRow.birth_date instanceof Date ? personRow.birth_date.toISOString().slice(0, 10) : String(personRow.birth_date))
        : (AIService.parseFormDateWithAge(form.basic.birthDateRaw, undefined) ?? undefined);

      // Bug real reportado en vivo: "¿Padece de gota?" y "¿Tiene
      // diabetes?" quedaban guardados como conditionName tal cual —
      // c.label es el texto de la pregunta que manda el móvil, no el
      // nombre de la enfermedad. Mismo fallback que el modelo
      // Estructurado (condition_label, editable desde admin-web), para
      // que el dato se registre igual sin importar por qué modelo se
      // haya cargado.
      const conditionQuestionIds = form.conditions.map((c) => c.questionId).filter((id): id is string => !!id);
      const conditionLabelById = new Map<string, string>();
      if (conditionQuestionIds.length > 0) {
        const rows = await queryRunner.query(
          `SELECT id, condition_label FROM ai.interview_questions WHERE id = ANY($1)`,
          [conditionQuestionIds],
        );
        for (const row of rows) {
          if (row.condition_label) conditionLabelById.set(row.id, row.condition_label);
        }
      }

      form.conditions.forEach((c, i) => {
        const detail = resolvedText(`condition_${i}`, c.detail ?? '').trim();
        const fallbackLabel = (c.questionId && conditionLabelById.get(c.questionId)) ||
          c.label.replace(/\s*\([^)]*\)\s*$/, '').trim();
        const conditionName = detail || fallbackLabel;
        candidates.push({
          proposalType: 'CONDITION',
          confidence: 0.9,
          data: {
            conditionName,
            statusCode: AIService.inferChronicStatus(c.label),
            diagnosedDateRaw: c.dateRaw,
            diagnosedDate: AIService.parseFormDateWithAge(c.dateRaw, birthDate),
            sourceQuestionId: c.questionId,
          },
        });
      });

      form.allergies.forEach((a, i) => {
        candidates.push({
          proposalType: 'ALLERGY',
          confidence: 0.9,
          data: {
            allergenName: resolvedText(`allergy_${i}`, a.name),
            allergenType: a.allergenType as AIAllergyProposalData['allergenType'],
            severity: a.severity as AIAllergyProposalData['severity'],
          },
        });
      });

      form.medications.forEach((m, i) => {
        candidates.push({
          proposalType: 'MEDICATION',
          confidence: 0.9,
          data: (() => {
            const dose = AIService.parseDoseText(m.dose);
            return {
              genericName: resolvedText(`medication_${i}`, m.name),
              prescribedDateRaw: m.sinceRaw,
              prescribedDate: AIService.parseFormDateWithAge(m.sinceRaw, birthDate),
              doseAmount: dose?.amount,
              doseUnit: dose?.unitCode,
              notes: !dose && m.dose?.trim() ? `Dosis: ${m.dose.trim()}` : undefined,
            };
          })(),
        });
      });

      form.surgeries.forEach((s, i) => {
        candidates.push({
          proposalType: 'SURGERY',
          confidence: 0.9,
          data: {
            procedureName: resolvedText(`surgery_${i}`, s.name),
            performedDateRaw: s.dateRaw,
            performedDate: AIService.parseFormDateWithAge(s.dateRaw, birthDate),
          },
        });
      });

      form.implants.forEach((im, i) => {
        candidates.push({
          proposalType: 'IMPLANT_DEVICE',
          confidence: 0.9,
          data: {
            deviceName: resolvedText(`implant_${i}`, im.name),
            implantedAtRaw: im.dateRaw,
            implantedAt: AIService.parseFormDateWithAge(im.dateRaw, birthDate),
          },
        });
      });

      const proposalRows = await this.insertProposals(
        queryRunner, conversationId, userMessage.id, personId, candidates, validationProvider, validationModel,
      );

      return { conversationId, proposals: proposalRows, corrections };
    });
  }

  /**
   * Pedido explícito del usuario: corregir el tipo/fecha de una
   * condición YA cargada (ej. "era Diabetes Tipo 2, no Tipo 1") tiene
   * que ser tan simple como cambiar el desplegable en el Formulario —
   * "esto que indicás es complicado de que el usuario lo entienda".
   * Mandar la corrección como si fuera un antecedente NUEVO chocaría
   * con trg_prevent_duplicate_condition_by_question (bloquea una
   * segunda respuesta para la misma pregunta, a propósito). Este
   * método actualiza la fila EXISTENTE directamente — nunca inserta,
   * así que ese trigger ni se entera (solo mira INSERT/UPDATE de
   * source_question_id, que acá no cambia).
   */
  async updateConditionAnswer(
    personId: string,
    conditionId: string,
    input: { conditionName: string; dateRaw?: string },
  ): Promise<{ id: string }> {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const [existing] = await queryRunner.query(
        `SELECT id FROM clinical.conditions WHERE id = $1 AND person_id = $2 AND deleted_at IS NULL`,
        [conditionId, personId],
      );
      if (!existing) {
        throw new NotFoundException('Condición no encontrada, o no pertenece a tu cuenta.');
      }

      const [personRow] = await queryRunner.query(
        `SELECT birth_date FROM core.persons WHERE id = $1`,
        [personId],
      );
      const birthDate: string | undefined = personRow?.birth_date
        ? (personRow.birth_date instanceof Date ? personRow.birth_date.toISOString().slice(0, 10) : String(personRow.birth_date))
        : undefined;

      const conditionCatalog = await this.catalogResolution.resolveOrCreate(
        'CONDITION_CATALOG',
        input.conditionName,
      );
      const diagnosedDate = AIService.parseFormDateWithAge(input.dateRaw, birthDate);

      await queryRunner.query(
        `UPDATE clinical.conditions
         SET condition_name = core.encrypt_pii($1), condition_catalog_id = $2,
             diagnosed_at = COALESCE($3::date, diagnosed_at)
         WHERE id = $4`,
        [input.conditionName, conditionCatalog.id, diagnosedDate ?? null, conditionId],
      );

      return { id: conditionId };
    });
  }

  // ══════════════════════════════════════════════════════════
  // MODELO ESTRUCTURADO — pedido explícito del usuario: un SEGUNDO
  // modelo de carga de Ficha de Salud, guiado por ai.interview_questions
  // (editable desde admin-web), que conviva con el modelo Clásico de
  // arriba (healthChat) para compararlos en una demo, costo de IA
  // incluido. A diferencia del Clásico (llama a OpenAI en TODOS los
  // turnos), acá solo se llama a OpenAI cuando una respuesta no se
  // puede interpretar de forma determinística — la mayoría de los
  // turnos ("sí"/"no" claros, o una opción de la lista) tienen costo
  // $0 (provider='structured', sin tokens ni estimatedCostUsd).
  // Comparte con el Clásico el mismo pipeline de guardado
  // (applyConfirmedProposal / confirmAllProposals) — un proposal
  // armado acá tiene EXACTAMENTE el mismo shape que uno del Clásico.
  // ══════════════════════════════════════════════════════════

  async structuredIntakeChat(
    personId: string,
    conversationId: string | undefined,
    answerText: string,
  ): Promise<{
    conversationId: string;
    reply: string;
    interviewComplete: boolean;
    /** Pedido explícito del usuario: poder tocar las opciones en pantalla en vez de solo decirlas/tipearlas. */
    options: string[] | null;
    /**
     * Pedido explícito del usuario: "la IA debería ser más inteligente,
     * no solo actuar según parámetros ingresados" — en vez de que la
     * app decida con una lista de frases fijas en español si el
     * viajero quiere pausar la entrevista, se lo pregunta a la MISMA
     * llamada a la IA que ya interpreta la respuesta ambigua (sin
     * llamado extra). true cuando la IA detectó ese pedido en
     * CUALQUIER idioma/forma — el cliente (app) tiene que confirmar
     * todo lo pendiente y cortar la charla en vez de mostrar esto como
     * una pregunta más.
     */
    pauseRequested: boolean;
  }> {
    return this.txManager.runInTransaction(async (queryRunner) => {
      // Pedido explícito del usuario: "esto debería estar en cualquier
      // indicación de la ficha médica... alguien puede decir que toma
      // un medicamento desde los 10 años" — mismo criterio que el
      // modelo Formulario (ver parseFormDateWithAge/resolveAgeRelativeDate),
      // acá aplicado a las respuestas del modelo Estructurado.
      const [birthRow] = await queryRunner.query(
        `SELECT birth_date FROM core.persons WHERE id = $1`,
        [personId],
      );
      const birthDate: string | undefined = birthRow?.birth_date
        ? (birthRow.birth_date instanceof Date ? birthRow.birth_date.toISOString().slice(0, 10) : String(birthRow.birth_date))
        : undefined;

      if (!conversationId) {
        const convId = await this.startStructuredConversation(queryRunner, personId);
        const firstQuestion = await this.getFirstActiveQuestion(queryRunner, personId);
        await queryRunner.query(
          `INSERT INTO ai.interview_sessions (conversation_id, person_id, current_question_id)
           VALUES ($1, $2, $3)`,
          [convId, personId, firstQuestion?.id ?? null],
        );

        const [person] = await queryRunner.query(
          `SELECT core.decrypt_pii(p.first_name) AS first_name, p.health_record_last_updated_at, p.preferred_lang,
                  EXISTS (
                    SELECT 1 FROM clinical.conditions WHERE person_id = p.id AND deleted_at IS NULL AND active = TRUE
                    UNION ALL SELECT 1 FROM clinical.allergies WHERE person_id = p.id AND deleted_at IS NULL AND active = TRUE
                    UNION ALL SELECT 1 FROM clinical.medications WHERE person_id = p.id AND deleted_at IS NULL AND active = TRUE
                    UNION ALL SELECT 1 FROM clinical.surgeries WHERE person_id = p.id AND deleted_at IS NULL
                    UNION ALL SELECT 1 FROM clinical.implants_devices WHERE person_id = p.id AND deleted_at IS NULL AND active = TRUE
                  ) AS has_data
           FROM core.persons p WHERE p.id = $1`,
          [personId],
        );
        const firstName = person?.first_name ?? '';
        const language = AIService.resolveLang(person?.preferred_lang);
        // Pedido explícito del usuario: si ya hay datos cargados, avisar
        // y dejar en claro que esto funciona como actualización — no
        // se vuelve a mostrar como si fuera la primera vez. Las
        // preguntas sobre antecedentes ya confirmados se saltan solas
        // (ver SKIP_IF_ALREADY_HAS_SQL en getFirstActiveQuestion). Se
        // chequea has_data además del timestamp — el trigger que
        // actualiza health_record_last_updated_at también dispara en
        // DELETE, así que un historial vaciado del todo no debe seguir
        // diciendo "ya tenés datos cargados".
        // Pedido explícito del usuario: poder editar este saludo desde
        // admin-web (Parámetros de la app) sin tocar la app — el texto
        // vive en params.app_settings, nunca hardcodeado acá. Los
        // fallbacks de abajo son solo por si el parámetro no existiera
        // (nunca debería pasar, la migración lo siembra).
        const hasExistingData = Boolean(person?.health_record_last_updated_at && person?.has_data);

        // Pedido explícito del usuario: si pasaron muchos días desde la
        // última actualización (umbral configurable, mismo
        // health.reminder_days que ya usa el banner de la app móvil),
        // el saludo tiene que preguntar puntualmente por novedades en
        // vez del genérico de "actualización" — reutiliza el mismo
        // recorrido salteando lo ya confirmado (SKIP_IF_ALREADY_HAS_SQL),
        // solo cambia el texto de bienvenida.
        const [reminderDaysSetting] = await queryRunner.query(
          `SELECT setting_value FROM params.app_settings WHERE setting_key = 'health.reminder_days'`,
        );
        const reminderDays = Number(reminderDaysSetting?.setting_value) || 60;
        const daysSinceUpdate = person?.health_record_last_updated_at
          ? Math.floor(
              (Date.now() - new Date(person.health_record_last_updated_at).getTime()) / (1000 * 60 * 60 * 24),
            )
          : null;
        const needsReminder = hasExistingData && daysSinceUpdate !== null && daysSinceUpdate >= reminderDays;

        const greetingKeyBase = needsReminder
          ? 'assistant.structured_greeting_reminder'
          : hasExistingData
            ? 'assistant.structured_greeting_update'
            : 'assistant.structured_greeting_new';
        // Pedido explícito del usuario: el saludo en el idioma del
        // viajero — pre-traducido y guardado (ver
        // translate-i18n-tmp.js), nunca traducido con IA en cada
        // charla. Si por algo faltara la clave del idioma, cae al
        // español antes que fallar.
        const greetingKey = language === 'es' ? greetingKeyBase : `${greetingKeyBase}.${language}`;
        const [greetingSetting] = await queryRunner.query(
          `SELECT COALESCE(
             (SELECT setting_value FROM params.app_settings WHERE setting_key = $1),
             (SELECT setting_value FROM params.app_settings WHERE setting_key = $2)
           ) AS setting_value`,
          [greetingKey, greetingKeyBase],
        );
        const greetingTemplate = greetingSetting?.setting_value ?? (
          needsReminder
            ? 'Hola {firstName}, soy su asistente virtual de Historial de Salud.\n\n' +
              'Veo que la última actualización fue el {lastUpdated} — ya pasó un buen tiempo. ¿Tenés alguna ' +
              'novedad de salud para contarme?\n\nVoy a repasar tus datos y saltear lo que ya está confirmado.'
            : hasExistingData
              ? 'Hola {firstName}, soy su asistente virtual de Historial de Salud.\n\n' +
                'Ya tenés datos cargados — la última actualización fue el {lastUpdated}. Esto va a funcionar ' +
                'como una actualización: voy a saltear lo que ya está confirmado y solo preguntarte por lo que ' +
                'falta o cambió.\n\nComenzaremos a repasar sus datos de salud.'
              : 'Hola {firstName}, soy su asistente virtual para confeccionar su historia clínica de salud.\n\n' +
                'Estos datos son total y absolutamente confidenciales y solo podrán ser utilizados por usted en ' +
                'caso de requerir atención médica durante su viaje, y con el objetivo de facilitar el acceso a ' +
                'una correcta atención.\n\nComenzaremos a registrar sus datos de salud.'
        );
        const dateLocale = { es: 'es-AR', en: 'en-US', pt: 'pt-BR', fr: 'fr-FR' }[language];
        const lastUpdated = person?.health_record_last_updated_at
          ? new Date(person.health_record_last_updated_at).toLocaleDateString(dateLocale)
          : '';
        const greeting = greetingTemplate
          .replaceAll('{firstName}', firstName)
          .replaceAll('{lastUpdated}', lastUpdated);
        const reply = firstQuestion
          ? `${greeting}\n\n${this.formatStructuredQuestion(firstQuestion, language)}`
          : `${greeting}\n\nNo hay preguntas configuradas todavía.`;
        // (el cliente móvil hace una pausa antes de leer la última
        // parte — ver health_assistant_screen.dart::_startConversation)

        await this.insertMessage(queryRunner, {
          conversationId: convId,
          personId,
          sender: 'ASSISTANT',
          message: reply,
          provider: 'structured',
          model: null,
        });

        const firstOptions = firstQuestion && firstQuestion.proposal_type !== 'MEDICATION'
          ? AIService.yesNoOptions(language)
          : null;
        return { conversationId: convId, reply, interviewComplete: false, options: firstOptions, pauseRequested: false };
      }

      const [session] = await queryRunner.query(
        `SELECT * FROM ai.interview_sessions WHERE conversation_id = $1`,
        [conversationId],
      );
      if (!session) {
        throw new BadRequestException('Conversación de modelo Estructurado no encontrada');
      }
      // Cada turno es un HTTP request aparte — preferred_lang vive en
      // core.persons (no en la sesión), así que se relee acá. Consulta
      // liviana, mismo criterio de costo que el resto del modelo
      // Estructurado (nunca IA solo para esto).
      const language = await this.getPersonLanguage(queryRunner, personId);

      const [userMessage] = await this.insertMessage(queryRunner, {
        conversationId,
        personId,
        sender: 'USER',
        message: answerText,
        provider: 'structured',
        model: null,
      });

      if (!session.current_question_id) {
        // Ya se había llegado al cierre — este turno es la respuesta a
        // "¿confirmamos?", que el cliente maneja con la misma lógica
        // sí/no ya usada para el Clásico (POST confirm-all aparte).
        return { conversationId, reply: AIService.t('confirmAllQuestion', language), interviewComplete: true, options: null, pauseRequested: false };
      }

      const currentQuestion = await this.getQuestionById(queryRunner, session.current_question_id);

      // Bug real reportado en vivo: cuando la IA corregía un typo
      // avisaba "decime si me equivoqué" pero en el MISMO mensaje ya
      // preguntaba lo siguiente — nunca esperaba la confirmación de
      // verdad. Este turno SÍ frena hasta recibir un sí/no real antes
      // de guardar lo interpretado y seguir (ver askToConfirmCorrection,
      // que es quien deja la sesión en este estado).
      if (session.pending_step === 'CONFIRM_CORRECTION') {
        const pending = (session.answers ?? {}) as {
          notice?: string;
          detail?: string | null;
          dateRaw?: string | null;
          date?: string | null;
          medications?: { name: string; dateRaw: string | null; date: string | null }[];
        };
        const normalized = AIService.stripAccents(answerText.trim().toLowerCase());
        // Toque de botón en cualquier idioma (ver matchesYesNo) — se
        // chequea antes que la regla en español, que no reconoce
        // "Yes"/"Sim"/"Oui".
        const exactYesNo = AIService.matchesYesNo(answerText, language);
        const isNegative = exactYesNo === 'no'
          || (exactYesNo === null
            && ((AIService.NEGATIVE_RE.test(normalized) && !AIService.AFFIRMATIVE_RE.test(normalized))
              || this.isRetraction(answerText)));
        const isAffirmative = !isNegative
          && (exactYesNo === 'yes' || AIService.AFFIRMATIVE_RE.test(normalized));

        // Pedido explícito del usuario: confirmación de una LISTA de
        // medicamentos (ver askToConfirmMedications) — distinto del
        // resto de este bloque, que maneja un solo "detail". No usa
        // FOLLOWUP para el "no" (medicamentos no tiene ese formato de
        // seguimiento): reinicia directo a la pregunta abierta.
        if (pending.medications) {
          if (isNegative) {
            await queryRunner.query(
              `UPDATE ai.interview_sessions SET pending_step = 'YES_NO', answers = '{}' WHERE id = $1`,
              [session.id],
            );
            const reply = this.formatStructuredQuestion(currentQuestion, language);
            await this.insertMessage(queryRunner, {
              conversationId, personId, sender: 'ASSISTANT', message: reply, provider: 'structured', model: null,
            });
            return { conversationId, reply, interviewComplete: false, options: null, pauseRequested: false };
          }
          if (!isAffirmative) {
            const reply = `${pending.notice ?? AIService.t('didntUnderstand', language)} ${AIService.t('yesNoSuffix', language)}`;
            await this.insertMessage(queryRunner, {
              conversationId, personId, sender: 'ASSISTANT', message: reply, provider: 'structured', model: null,
            });
            return { conversationId, reply, interviewComplete: false, options: AIService.yesNoOptions(language), pauseRequested: false };
          }
          const candidates = pending.medications.map((m) =>
            this.buildStructuredProposal(currentQuestion, { detail: m.name, dateRaw: m.dateRaw, date: m.date }),
          );
          await this.insertProposals(
            queryRunner, conversationId, userMessage.id, personId, candidates, 'structured', 'structured',
          );
          return this.advanceToNextQuestion(queryRunner, conversationId, personId, session, currentQuestion, language);
        }

        if (isNegative) {
          // No es correcto — se descarta lo interpretado y se vuelve
          // a pedir el detalle limpio, sin dar nada por guardado.
          await queryRunner.query(
            `UPDATE ai.interview_sessions SET pending_step = 'FOLLOWUP', answers = '{}' WHERE id = $1`,
            [session.id],
          );
          const reply = this.formatFollowupPrompt(true, currentQuestion.asks_date, currentQuestion.options, language);
          await this.insertMessage(queryRunner, {
            conversationId, personId, sender: 'ASSISTANT', message: reply, provider: 'structured', model: null,
          });
          return { conversationId, reply, interviewComplete: false, options: currentQuestion.options ?? null, pauseRequested: false };
        }

        if (!isAffirmative) {
          // Ambiguo: se repite la confirmación en vez de asumir que sí.
          const reply = `${pending.notice ?? AIService.t('didntUnderstand', language)} ${AIService.t('yesNoSuffix', language)}`;
          await this.insertMessage(queryRunner, {
            conversationId, personId, sender: 'ASSISTANT', message: reply, provider: 'structured', model: null,
          });
          return { conversationId, reply, interviewComplete: false, options: AIService.yesNoOptions(language), pauseRequested: false };
        }

        // Confirmado — recién ahora se guarda lo interpretado y se
        // sigue, con el mismo criterio de "¿falta algo?" que el resto
        // del modelo (puede faltar todavía la fecha, por ejemplo).
        const detail = pending.detail ?? null;
        const dateRaw = pending.dateRaw ?? null;
        const date = pending.date ?? null;
        const missingDetail = currentQuestion.free_text_enabled && !detail;
        const missingDate = currentQuestion.asks_date && !dateRaw && !date;

        if (missingDetail || missingDate) {
          await queryRunner.query(
            `UPDATE ai.interview_sessions SET pending_step = 'FOLLOWUP', answers = $2 WHERE id = $1`,
            [session.id, JSON.stringify({ detail, dateRaw, date })],
          );
          const reply = this.formatFollowupPrompt(missingDetail, missingDate, currentQuestion.options, language);
          await this.insertMessage(queryRunner, {
            conversationId, personId, sender: 'ASSISTANT', message: reply, provider: 'structured', model: null,
          });
          return {
            conversationId, reply, interviewComplete: false,
            options: missingDetail ? (currentQuestion.options ?? null) : null,
            pauseRequested: false,
          };
        }

        const candidate = this.buildStructuredProposal(currentQuestion, { detail, dateRaw, date });
        await this.insertProposals(
          queryRunner, conversationId, userMessage.id, personId, [candidate], 'structured', 'structured',
        );
        return this.advanceToNextQuestion(queryRunner, conversationId, personId, session, currentQuestion, language);
      }

      // Turno de seguimiento: ya se sabe que la respuesta es afirmativa
      // (eso se resolvió en el turno YES_NO anterior) — acá solo falta
      // sacar el detalle y/o la fecha que quedaron pendientes, guardados
      // en session.answers mientras tanto. No es una pregunta de sí/no,
      // así que no pasa por tryDeterministicParse.
      if (session.pending_step === 'FOLLOWUP') {
        // Bug real reportado en vivo: al pedir el detalle tras un "sí",
        // si la persona se daba cuenta que se había confundido ("no,
        // me confundí, no tuve eso") no había forma de volver atrás —
        // el turno seguía esperando un nombre de condición para
        // siempre. Se chequea ANTES que cualquier otra cosa: si es una
        // retractación, se descarta la pregunta actual sin guardar
        // ningún proposal y se pasa a la siguiente, igual que un "no"
        // limpio en el turno inicial.
        if (this.isRetraction(answerText)) {
          return this.advanceToNextQuestion(queryRunner, conversationId, personId, session, currentQuestion, language);
        }

        const priorAnswers = (session.answers ?? {}) as {
          detail?: string | null;
          dateRaw?: string | null;
          date?: string | null;
        };
        const needsDetail = currentQuestion.free_text_enabled && !priorAnswers.detail;

        let finalDetail = priorAnswers.detail ?? null;
        let finalDateRaw = priorAnswers.dateRaw ?? null;
        let finalDate = priorAnswers.date ?? null;

        // Bug real reportado en vivo (dos veces): con preguntas SIN
        // opciones, "anda mientras" y "te escucha" — ruido captado
        // hablando con otra persona al lado — se aceptaban igual como
        // si fueran el nombre real de una enfermedad, porque el
        // seguimiento se resolvía 100% con regex/heurísticas locales.
        // Ningún filtro de muletillas fijo cubre ruido impredecible —
        // acá, sin opciones, se valida el detalle con IA en vez de
        // aceptar cualquier texto libre. Con opciones (ej. los 3 tipos
        // de diabetes) se sigue resolviendo gratis, determinístico.
        // Pedido explícito del usuario: si en vez de contestar hace una
        // pregunta ("¿qué es eso?"), la IA la contesta acá antes de
        // repetir la pregunta original en seco.
        let clarification: string | null = null;
        // Pedido explícito del usuario: si escribió "asmita" y se guardó
        // como "Asma" sin decir nada, no se enteraba de la corrección.
        // Se le avisa en el próximo mensaje (no bloquea el turno con una
        // pregunta extra) y puede corregirlo con "no, me confundí" —
        // mismo mecanismo de retractación que ya existe.
        let correctionNotice: string | null = null;

        if (needsDetail && !currentQuestion.options?.length) {
          const knownNames = await this.getKnownCatalogNames(queryRunner, currentQuestion.catalog_domain_code);
          const llmResult = await this.provider.interpretStructuredAnswer(
            {
              questionText: currentQuestion.question_text,
              options: currentQuestion.options,
              asksDate: currentQuestion.asks_date,
            },
            answerText,
            knownNames,
            language,
          );
          await this.insertMessage(queryRunner, {
            conversationId,
            personId,
            sender: 'ASSISTANT',
            message: '(interpretación IA del detalle)',
            provider: llmResult.provider,
            model: llmResult.model,
            tokensInput: llmResult.tokensInput,
            tokensOutput: llmResult.tokensOutput,
            estimatedCostUsd: llmResult.estimatedCostUsd,
            processingMs: llmResult.processingMs,
          });
          // Pedido explícito del usuario: la IA entiende "quiero pausar"
          // en cualquier idioma/forma en vez de una lista de frases fijas
          // — se confirma todo lo pendiente EN ESTA MISMA transacción y
          // se corta la entrevista, sin tratar el texto como respuesta.
          if (llmResult.wantsToPause) {
            await this.confirmAllProposalsInTx(queryRunner, personId, conversationId);
            const reply = AIService.t('savedSoFar', language);
            await this.insertMessage(queryRunner, {
              conversationId, personId, sender: 'ASSISTANT', message: reply, provider: 'structured', model: null,
            });
            return { conversationId, reply, interviewComplete: true, options: null, pauseRequested: true };
          }
          if (!llmResult.unclear && llmResult.applicable && llmResult.detail) {
            finalDetail = llmResult.detail;
            finalDateRaw ??= llmResult.dateRaw;
            finalDate ??= llmResult.date;
            if (llmResult.correctedFrom) {
              correctionNotice = AIService.t('correctionNotice', language)
                .replace('{detail}', llmResult.detail)
                .replace('{original}', llmResult.correctedFrom);
            }
          }
          clarification = llmResult.clarification;
        } else {
          const followupParsed = this.parseFollowupAnswer(currentQuestion, answerText, priorAnswers, birthDate);
          finalDetail ??= followupParsed.detail;
          finalDateRaw ??= followupParsed.dateRaw;
          finalDate ??= followupParsed.date;
        }

        // Ninguno de los dos caminos de arriba arma un proposal con un
        // label inventado o con la pregunta pelada como fallback — si
        // sigue sin haber detalle (no matcheó ninguna opción, o la IA
        // lo marcó unclear/no aplicable), se vuelve a pedir en vez de
        // guardar algo dudoso.
        if (currentQuestion.free_text_enabled && !finalDetail) {
          // Bug real reportado en vivo: la respuesta salía "sin lógica"
          // — cuando la IA ya devuelve su PROPIA pregunta de aclaración
          // completa (ej. "¿Tuvo alguna enfermedad cardiovascular? ¿Qué
          // le diagnosticaron en 2024?"), esto le pegaba ADEMÁS el
          // genérico "¿Cuál?" al final, duplicando la pregunta. El
          // "¿Cuál?" de formatFollowupPrompt solo hace falta como
          // continuación del "No entendí tu respuesta" genérico — la
          // clarificación de la IA ya viene completa por su cuenta.
          const reply = clarification
            ?? `${AIService.t('didntUnderstand', language)} ${this.formatFollowupPrompt(true, false, currentQuestion.options, language)}`;
          await this.insertMessage(queryRunner, {
            conversationId, personId, sender: 'ASSISTANT', message: reply, provider: 'structured', model: null,
          });
          return { conversationId, reply, interviewComplete: false, options: currentQuestion.options ?? null, pauseRequested: false };
        }

        // Bug real reportado en vivo: al elegir una opción (ej. "1" para
        // Diabetes Tipo 1) esto guardaba el antecedente y avanzaba SIN
        // pedir la fecha, aunque la pregunta la tuviera activa — solo se
        // chequeaba si faltaba el detalle, nunca si faltaba la fecha
        // por separado. Con el detalle ya resuelto pero la fecha
        // todavía pendiente, se sigue en FOLLOWUP y se pide puntualmente
        // la fecha en el próximo turno, en vez de guardarlo sin ella.
        const stillMissingDate = currentQuestion.asks_date && !finalDateRaw && !finalDate;
        if (stillMissingDate) {
          // Bug real reportado en vivo: si se corrigió un typo (ej.
          // "asmita" -> "Asma"), el aviso "decime si me equivoqué" iba
          // pegado a la siguiente pregunta en el MISMO mensaje — nunca
          // esperaba la confirmación de verdad. Ahora, si hay corrección
          // pendiente, se frena ACÁ hasta recibir un sí/no real (ver
          // pending_step = 'CONFIRM_CORRECTION').
          if (correctionNotice) {
            return this.askToConfirmCorrection(
              queryRunner, conversationId, personId, session,
              correctionNotice, finalDetail, finalDateRaw, finalDate, language,
            );
          }
          await queryRunner.query(
            `UPDATE ai.interview_sessions SET answers = $2 WHERE id = $1`,
            [session.id, JSON.stringify({ detail: finalDetail, dateRaw: finalDateRaw, date: finalDate })],
          );
          const reply = this.formatFollowupPrompt(false, true, null, language);
          await this.insertMessage(queryRunner, {
            conversationId, personId, sender: 'ASSISTANT', message: reply, provider: 'structured', model: null,
          });
          return { conversationId, reply, interviewComplete: false, options: null, pauseRequested: false };
        }

        // Mismo criterio que arriba: con corrección pendiente, primero
        // se confirma — recién con el sí se guarda y se pasa a la
        // siguiente pregunta (ver CONFIRM_CORRECTION más abajo).
        if (correctionNotice) {
          return this.askToConfirmCorrection(
            queryRunner, conversationId, personId, session,
            correctionNotice, finalDetail, finalDateRaw, finalDate, language,
          );
        }

        const candidate = this.buildStructuredProposal(currentQuestion, {
          detail: finalDetail,
          dateRaw: finalDateRaw,
          date: finalDate,
        });
        await this.insertProposals(
          queryRunner,
          conversationId,
          userMessage.id,
          personId,
          [candidate],
          'structured',
          'structured',
        );

        return this.advanceToNextQuestion(queryRunner, conversationId, personId, session, currentQuestion, language);
      }

      // Pregunta abierta (medicamentos): no es un sí/no, la respuesta ES
      // el detalle directamente — salvo que diga que no toma ninguno.
      // Bug real reportado en vivo: "cuando se informan varios
      // medicamentos la app debería grabarlos todos por separado no
      // en una sola línea, además debería validar correctamente el
      // nombre" — antes se guardaba TODO el texto libre tal cual como
      // un único genericName, sin separar por droga ni corregir
      // errores de tipeo (a diferencia de CONDITION/ALLERGY, que ya
      // pasan por interpretación con corrección). Ahora pasa por
      // interpretMedicationAnswer, que separa y corrige cada nombre —
      // el "saysNone" determinístico se mantiene primero para no
      // gastar un llamado a IA en el caso más común ("no tomo nada").
      if (currentQuestion.proposal_type === 'MEDICATION') {
        const normalized = AIService.stripAccents(answerText.trim().toLowerCase());
        const saysNone = !normalized || /^(no|ninguno|ninguna|no tomo|no uso|no consumo)\b/.test(normalized);
        if (saysNone) {
          return this.advanceToNextQuestion(queryRunner, conversationId, personId, session, currentQuestion, language);
        }

        const knownNames = await this.getKnownCatalogNames(queryRunner, currentQuestion.catalog_domain_code);
        const llmResult = await this.provider.interpretMedicationAnswer(answerText, knownNames, language);
        await this.insertMessage(queryRunner, {
          conversationId,
          personId,
          sender: 'ASSISTANT',
          message: '(interpretación IA de medicamentos)',
          provider: llmResult.provider,
          model: llmResult.model,
          tokensInput: llmResult.tokensInput,
          tokensOutput: llmResult.tokensOutput,
          estimatedCostUsd: llmResult.estimatedCostUsd,
          processingMs: llmResult.processingMs,
        });

        if (llmResult.wantsToPause) {
          await this.confirmAllProposalsInTx(queryRunner, personId, conversationId);
          const reply = AIService.t('savedSoFar', language);
          await this.insertMessage(queryRunner, {
            conversationId, personId, sender: 'ASSISTANT', message: reply, provider: 'structured', model: null,
          });
          return { conversationId, reply, interviewComplete: true, options: null, pauseRequested: true };
        }

        if (llmResult.unclear) {
          const intro = llmResult.clarification ?? AIService.t('didntUnderstand', language);
          const reply = `${intro} ${this.formatStructuredQuestion(currentQuestion, language)}`;
          await this.insertMessage(queryRunner, {
            conversationId, personId, sender: 'ASSISTANT', message: reply, provider: 'structured', model: null,
          });
          return { conversationId, reply, interviewComplete: false, options: null, pauseRequested: false };
        }

        if (!llmResult.applicable || !llmResult.medications.length) {
          return this.advanceToNextQuestion(queryRunner, conversationId, personId, session, currentQuestion, language);
        }

        // Si corrigió algún nombre, primero se confirma (mismo criterio
        // que condiciones/cirugías) — recién con el sí se guarda cada
        // medicamento como un proposal SEPARADO.
        const anyCorrected = llmResult.medications.some((m) => m.correctedFrom);
        if (anyCorrected) {
          return this.askToConfirmMedications(
            queryRunner, conversationId, personId, session,
            llmResult.medications.map((m) => ({ name: m.name, dateRaw: m.dateRaw, date: m.date })), language,
          );
        }

        // Bug real reportado en vivo: "se debería registrar con su
        // fecha de prescripción" — antes esto siempre mandaba
        // dateRaw/date en null sin importar lo que haya dicho el
        // viajero (interpretMedicationAnswer ahora sí la extrae por
        // medicamento, ver AIMedicationSplitResult).
        const candidates = llmResult.medications.map((m) =>
          this.buildStructuredProposal(currentQuestion, { detail: m.name, dateRaw: m.dateRaw, date: m.date }),
        );
        await this.insertProposals(
          queryRunner,
          conversationId,
          userMessage.id,
          personId,
          candidates,
          'structured',
          'structured',
        );
        return this.advanceToNextQuestion(queryRunner, conversationId, personId, session, currentQuestion, language);
      }

      // Turno normal: se pidió "indique sí o no" — hay que resolver eso
      // primero antes de pensar en detalle/fecha.
      let parsed = this.tryDeterministicParse(answerText, currentQuestion, language, birthDate);
      // Mismo aviso de corrección de typo que en FOLLOWUP — acá aplica
      // cuando contestó todo junto ("sí, tengo asmita") y el detalle se
      // sacó vía IA en vez de determinístico.
      let correctionNotice: string | null = null;

      if (!parsed) {
        const knownNames = await this.getKnownCatalogNames(queryRunner, currentQuestion.catalog_domain_code);
        const llmResult = await this.provider.interpretStructuredAnswer(
          {
            questionText: currentQuestion.question_text,
            options: currentQuestion.options,
            asksDate: currentQuestion.asks_date,
          },
          answerText,
          knownNames,
          language,
        );
        await this.insertMessage(queryRunner, {
          conversationId,
          personId,
          sender: 'ASSISTANT',
          message: '(interpretación IA de la respuesta anterior)',
          provider: llmResult.provider,
          model: llmResult.model,
          tokensInput: llmResult.tokensInput,
          tokensOutput: llmResult.tokensOutput,
          estimatedCostUsd: llmResult.estimatedCostUsd,
          processingMs: llmResult.processingMs,
        });

        // Mismo criterio que en FOLLOWUP: la IA entiende "quiero pausar"
        // en cualquier idioma/forma, aprovechando este mismo llamado —
        // se confirma todo lo pendiente y se corta, sin tratar el texto
        // como respuesta a la pregunta actual.
        if (llmResult.wantsToPause) {
          await this.confirmAllProposalsInTx(queryRunner, personId, conversationId);
          const reply = AIService.t('savedSoFar', language);
          await this.insertMessage(queryRunner, {
            conversationId, personId, sender: 'ASSISTANT', message: reply, provider: 'structured', model: null,
          });
          return { conversationId, reply, interviewComplete: true, options: null, pauseRequested: true };
        }

        // Bug real reportado en vivo (por voz): ruido mal transcripto,
        // "¿me escuchás?" o una frase de otro tema se estaban tratando
        // como un "no" y la entrevista avanzaba sola sin haber
        // contestado nada. Con unclear=true se repite la MISMA
        // pregunta en vez de asumir que no tiene el antecedente. Si
        // hizo una pregunta en vez de contestar, se la responde primero
        // (ver "clarification") antes de repetirla.
        if (llmResult.unclear) {
          const intro = llmResult.clarification ?? AIService.t('didntUnderstand', language);
          const reply = `${intro} ${this.formatStructuredQuestion(currentQuestion, language)}`;
          await this.insertMessage(queryRunner, {
            conversationId,
            personId,
            sender: 'ASSISTANT',
            message: reply,
            provider: 'structured',
            model: null,
          });
          return {
            conversationId, reply, interviewComplete: false,
            options: currentQuestion.proposal_type !== 'MEDICATION' ? AIService.yesNoOptions(language) : null,
            pauseRequested: false,
          };
        }

        parsed = { applicable: llmResult.applicable, detail: llmResult.detail, dateRaw: llmResult.dateRaw, date: llmResult.date };
        if (llmResult.correctedFrom && llmResult.detail) {
          correctionNotice = AIService.t('correctionNotice', language)
            .replace('{detail}', llmResult.detail)
            .replace('{original}', llmResult.correctedFrom);
        }
      }

      if (!parsed.applicable) {
        return this.advanceToNextQuestion(queryRunner, conversationId, personId, session, currentQuestion, language);
      }

      const missingDetail = currentQuestion.free_text_enabled && !parsed.detail;
      const missingDate = currentQuestion.asks_date && !parsed.dateRaw && !parsed.date;

      if (missingDetail || missingDate) {
        // Respondió que sí, pero falta el detalle y/o la fecha — se
        // guarda lo que ya se sacó y se pide puntualmente lo que falta
        // en el próximo turno, en vez de mostrar todo junto desde el
        // principio (pedido explícito del usuario). Si además hubo
        // corrección, se frena a confirmar primero (ver
        // askToConfirmCorrection) en vez de pegar el aviso al pedido de
        // lo que falta en el mismo mensaje.
        if (correctionNotice) {
          return this.askToConfirmCorrection(
            queryRunner, conversationId, personId, session,
            correctionNotice, parsed.detail, parsed.dateRaw, parsed.date, language,
          );
        }
        await queryRunner.query(
          `UPDATE ai.interview_sessions SET pending_step = 'FOLLOWUP', answers = $2 WHERE id = $1`,
          [session.id, JSON.stringify({ detail: parsed.detail, dateRaw: parsed.dateRaw, date: parsed.date })],
        );
        const reply = this.formatFollowupPrompt(missingDetail, missingDate, currentQuestion.options, language);
        await this.insertMessage(queryRunner, {
          conversationId,
          personId,
          sender: 'ASSISTANT',
          message: reply,
          provider: 'structured',
          model: null,
        });
        return {
          conversationId,
          reply,
          interviewComplete: false,
          options: missingDetail ? (currentQuestion.options ?? null) : null,
          pauseRequested: false,
        };
      }

      // Mismo criterio: con corrección pendiente, primero se confirma
      // — recién con el sí se guarda y se pasa a la siguiente pregunta.
      if (correctionNotice) {
        return this.askToConfirmCorrection(
          queryRunner, conversationId, personId, session,
          correctionNotice, parsed.detail, parsed.dateRaw, parsed.date, language,
        );
      }

      const candidate = this.buildStructuredProposal(currentQuestion, parsed);
      await this.insertProposals(
        queryRunner,
        conversationId,
        userMessage.id,
        personId,
        [candidate],
        'structured',
        'structured',
      );

      return this.advanceToNextQuestion(queryRunner, conversationId, personId, session, currentQuestion, language);
    });
  }

  private async advanceToNextQuestion(
    queryRunner: QueryRunner,
    conversationId: string,
    personId: string,
    session: { id: string },
    currentQuestion: { display_order: number },
    language: SupportedLang = 'es',
  ): Promise<{ conversationId: string; reply: string; interviewComplete: boolean; options: string[] | null; pauseRequested: boolean }> {
    const nextQuestion = await this.getNextActiveQuestion(queryRunner, personId, currentQuestion.display_order);
    await queryRunner.query(
      `UPDATE ai.interview_sessions
       SET current_question_id = $2, pending_step = 'YES_NO', answers = '{}'
       WHERE id = $1`,
      [session.id, nextQuestion?.id ?? null],
    );

    const reply = nextQuestion
      ? this.formatStructuredQuestion(nextQuestion, language)
      : AIService.t('saveAllQuestion', language);
    await this.insertMessage(queryRunner, {
      conversationId,
      personId,
      sender: 'ASSISTANT',
      message: reply,
      provider: 'structured',
      model: null,
    });

    const nextOptions = nextQuestion && nextQuestion.proposal_type !== 'MEDICATION'
      ? AIService.yesNoOptions(language)
      : null;
    return { conversationId, reply, interviewComplete: !nextQuestion, options: nextOptions, pauseRequested: false };
  }

  /**
   * Pedido explícito del usuario: cuando la IA corrige un typo (ej.
   * "asmita" -> "Asma"), "decime si me equivoqué" tiene que ser una
   * pregunta de verdad — este método corta la entrevista acá, deja la
   * sesión en pending_step = 'CONFIRM_CORRECTION' con lo interpretado
   * guardado, y recién avanza a la siguiente pregunta cuando el
   * viajero confirma (ver el branch CONFIRM_CORRECTION en
   * structuredIntakeChat). Antes esto se pegaba en el mismo mensaje
   * que la siguiente pregunta, así que la "confirmación" nunca se
   * esperaba de verdad.
   */
  private async askToConfirmCorrection(
    queryRunner: QueryRunner,
    conversationId: string,
    personId: string,
    session: { id: string },
    notice: string,
    detail: string | null,
    dateRaw: string | null,
    date: string | null,
    language: SupportedLang,
  ): Promise<{ conversationId: string; reply: string; interviewComplete: boolean; options: string[] | null; pauseRequested: boolean }> {
    await queryRunner.query(
      `UPDATE ai.interview_sessions SET pending_step = 'CONFIRM_CORRECTION', answers = $2 WHERE id = $1`,
      [session.id, JSON.stringify({ notice, detail, dateRaw, date })],
    );
    const reply = `${notice} ${AIService.t('yesNoSuffix', language)}`;
    await this.insertMessage(queryRunner, {
      conversationId, personId, sender: 'ASSISTANT', message: reply, provider: 'structured', model: null,
    });
    return { conversationId, reply, interviewComplete: false, options: AIService.yesNoOptions(language), pauseRequested: false };
  }

  /**
   * Pedido explícito del usuario: "cuando se informan varios
   * medicamentos... debería validar correctamente el nombre" — mismo
   * mecanismo que askToConfirmCorrection (frena hasta un sí/no real
   * antes de guardar), pero para una LISTA de medicamentos en vez de
   * un solo detail — reutiliza pending_step = 'CONFIRM_CORRECTION',
   * distinguido por session.answers.medications (ver el branch más
   * arriba en structuredIntakeChat).
   */
  private async askToConfirmMedications(
    queryRunner: QueryRunner,
    conversationId: string,
    personId: string,
    session: { id: string },
    medications: { name: string; dateRaw: string | null; date: string | null }[],
    language: SupportedLang,
  ): Promise<{ conversationId: string; reply: string; interviewComplete: boolean; options: string[] | null; pauseRequested: boolean }> {
    const notice = AIService.t('medicationsCorrectionNotice', language)
      .replace('{names}', medications.map((m) => m.name).join(', '));
    await queryRunner.query(
      `UPDATE ai.interview_sessions SET pending_step = 'CONFIRM_CORRECTION', answers = $2 WHERE id = $1`,
      [session.id, JSON.stringify({ notice, medications })],
    );
    const reply = `${notice} ${AIService.t('yesNoSuffix', language)}`;
    await this.insertMessage(queryRunner, {
      conversationId, personId, sender: 'ASSISTANT', message: reply, provider: 'structured', model: null,
    });
    return { conversationId, reply, interviewComplete: false, options: AIService.yesNoOptions(language), pauseRequested: false };
  }

  private async startStructuredConversation(
    queryRunner: QueryRunner,
    personId: string,
  ): Promise<string> {
    const [row] = await queryRunner.query(
      `INSERT INTO ai.conversations (person_id, conversation_type, intake_model)
       VALUES ($1, 'HEALTH_DATA_CAPTURE', 'STRUCTURED')
       RETURNING id`,
      [personId],
    );
    return row.id;
  }

  /**
   * Pedido explícito del usuario: "no se tiene que preguntar dos veces
   * lo mismo" — si ya existe un antecedente CONFIRMADO que se originó
   * en ESTA MISMA pregunta, se la salta.
   *
   * Bug real reportado en vivo: la versión anterior comparaba el
   * código de la pregunta contra el código del catálogo resuelto para
   * la respuesta (ej. HYPERTENSION/DIABETES/HEPATITIS, donde
   * coinciden 1 a 1) — pero varias preguntas son "paraguas" que cubren
   * MUCHAS enfermedades puntuales distintas (CHRONIC_LUNG_DISEASE
   * agrupa asma, EPOC, fibrosis pulmonar, etc.; también
   * CARDIOVASCULAR_DISEASE, HEMATOLOGIC_DISEASE, ONCOLOGIC_DISEASE,
   * METABOLIC_DISEASE) — ahí el código de la pregunta NUNCA coincide
   * con el código específico que terminó guardado, así que la pregunta
   * se repetía siempre aunque ya estuviera confirmada. Se reemplaza
   * por source_question_id (seteado en buildStructuredProposal/
   * applyConfirmedProposal): vínculo directo a la pregunta que originó
   * el antecedente, sin importar cuántas variantes distintas cubra.
   * Solo aplica a CONDITION/SURGERY (antecedentes puntuales de un solo
   * hecho); alergias/medicamentos son abiertos y siempre se preguntan.
   */
  /**
   * Pedido explícito del usuario: el modelo Estructurado tiene que
   * poder hablar en el idioma preferido del viajero. El TEXTO de cada
   * pregunta y los saludos ya están pre-traducidos y guardados (ver
   * ai.interview_questions.question_text_en/pt/fr y
   * params.app_settings assistant.structured_greeting_*.en/pt/fr) —
   * pero las frases FIJAS que arma este servicio directamente en
   * código (sí/no, "¿cuál?", avisos de corrección, cierre) no salen
   * de ahí, así que necesitan su propio diccionario acá. Nunca se
   * traduce con IA en cada turno — mismo criterio de costo que el
   * resto del modelo Estructurado.
   */
  private static readonly UI_STRINGS: Record<string, Record<SupportedLang, string>> = {
    yesNoSuffix: {
      es: 'Indique sí o no.', en: 'Please answer yes or no.',
      pt: 'Responda sim ou não.', fr: 'Répondez oui ou non.',
    },
    yesLabel: { es: 'Sí', en: 'Yes', pt: 'Sim', fr: 'Oui' },
    noLabel: { es: 'No', en: 'No', pt: 'Não', fr: 'Non' },
    whichOne: {
      es: '¿Cuál?', en: 'Which one?', pt: 'Qual?', fr: 'Lequel ?',
    },
    whichOneAndDate: {
      es: '¿Cuál, y en qué fecha aproximada?', en: 'Which one, and approximately when?',
      pt: 'Qual, e em que data aproximada?', fr: 'Lequel, et à quelle date approximative ?',
    },
    whenApprox: {
      es: '¿En qué fecha aproximada?', en: 'Approximately when?',
      pt: 'Em que data aproximada?', fr: 'À quelle date approximative ?',
    },
    optionsLabel: {
      es: 'Opciones:', en: 'Options:', pt: 'Opções:', fr: 'Options :',
    },
    didntUnderstand: {
      es: 'No entendí bien tu respuesta.', en: "I didn't quite understand your answer.",
      pt: 'Não entendi bem sua resposta.', fr: "Je n'ai pas bien compris votre réponse.",
    },
    savedSoFar: {
      es: 'Listo, guardé todo lo que contestaste hasta ahora. Podés retomar cuando quieras.',
      en: "Done — I've saved everything you answered so far. You can pick up again whenever you like.",
      pt: 'Pronto — salvei tudo o que você respondeu até agora. Você pode continuar quando quiser.',
      fr: "C'est fait — j'ai enregistré tout ce que vous avez répondu jusqu'ici. Vous pouvez reprendre quand vous voulez.",
    },
    saveAllQuestion: {
      es: '¿Guardamos todo esto en su Historial de Salud?', en: 'Shall we save all of this to your Health Record?',
      pt: 'Salvamos tudo isso no seu Histórico de Saúde?', fr: 'Enregistrons-nous tout cela dans votre Dossier de Santé ?',
    },
    confirmAllQuestion: {
      es: '¿Confirmamos todo? Decime sí o no.', en: 'Shall we confirm everything? Say yes or no.',
      pt: 'Confirmamos tudo? Diga sim ou não.', fr: 'Confirmons-nous tout ? Dites oui ou non.',
    },
    /** {detail} y {original} se reemplazan — ver correctionNotice más abajo. */
    correctionNotice: {
      es: 'Anoté "{detail}" (interpretando lo que escribiste: "{original}") — ¿está bien así?',
      en: 'I noted "{detail}" (interpreting what you wrote: "{original}") — is that correct?',
      pt: 'Anotei "{detail}" (interpretando o que você escreveu: "{original}") — está correto?',
      fr: 'J\'ai noté « {detail} » (en interprétant ce que vous avez écrit : « {original} ») — est-ce correct ?',
    },
    /**
     * Pedido explícito del usuario: varios medicamentos mencionados
     * juntos se listan por separado (nunca en una sola línea) y con
     * el nombre corregido — mismo criterio de "avisar, no corregir en
     * silencio" que correctionNotice, pero para una lista en vez de
     * un solo ítem (ver interpretMedicationAnswer).
     */
    medicationsCorrectionNotice: {
      es: 'Anoté estos medicamentos por separado: {names} — ¿está bien así?',
      en: 'I noted these medications separately: {names} — is that correct?',
      pt: 'Anotei estes medicamentos separadamente: {names} — está correto?',
      fr: 'J\'ai noté ces médicaments séparément : {names} — est-ce correct ?',
    },
  };

  private static t(key: keyof typeof AIService.UI_STRINGS, language: SupportedLang): string {
    return AIService.UI_STRINGS[key][language] ?? AIService.UI_STRINGS[key].es;
  }

  /**
   * Pedido explícito del usuario: en vez de tener que tipear "sí"/"no"
   * a mano, el chat de la app ya sabe mostrar botones cuando `options`
   * viene con datos (mismo mecanismo que las preguntas con catálogo
   * cerrado, ej. tipos de diabetes) — acá se reutiliza ese mismo campo
   * para las preguntas de sí/no, sin tocar nada del lado móvil.
   */
  private static yesNoOptions(language: SupportedLang): string[] {
    return [AIService.t('yesLabel', language), AIService.t('noLabel', language)];
  }

  /**
   * AFFIRMATIVE_RE/NEGATIVE_RE solo reconocen español ("sí"/"no" y
   * variantes) — suficiente para texto libre tipeado/hablado, pero un
   * toque de los botones Sí/No en inglés/portugués/francés (ver
   * yesNoOptions) manda el label tal cual ("Yes"/"Sim"/"Oui") y esas
   * palabras no matchean nada de la regla en español. Se chequea
   * primero una igualdad exacta contra el label del idioma actual —
   * cubre cualquier idioma sin tocar la regla en español.
   */
  private static matchesYesNo(answerText: string, language: SupportedLang): 'yes' | 'no' | null {
    const normalized = AIService.stripAccents(answerText.trim().toLowerCase());
    if (normalized === AIService.stripAccents(AIService.t('yesLabel', language).toLowerCase())) return 'yes';
    if (normalized === AIService.stripAccents(AIService.t('noLabel', language).toLowerCase())) return 'no';
    return null;
  }

  private static readonly SKIP_IF_ALREADY_HAS_SQL = `
    AND NOT EXISTS (
      SELECT 1 FROM clinical.conditions c
      WHERE c.person_id = $1 AND c.deleted_at IS NULL AND c.active = TRUE
        AND q.proposal_type = 'CONDITION' AND c.source_question_id = q.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM clinical.surgeries s
      WHERE s.person_id = $1 AND s.deleted_at IS NULL
        AND q.proposal_type = 'SURGERY' AND s.source_question_id = q.id
    )
  `;

  private async getFirstActiveQuestion(queryRunner: QueryRunner, personId: string) {
    const [row] = await queryRunner.query(
      `SELECT q.* FROM ai.interview_questions q
       WHERE q.active = TRUE ${AIService.SKIP_IF_ALREADY_HAS_SQL}
       ORDER BY q.display_order ASC LIMIT 1`,
      [personId],
    );
    return row;
  }

  private async getNextActiveQuestion(queryRunner: QueryRunner, personId: string, afterDisplayOrder: number) {
    const [row] = await queryRunner.query(
      `SELECT q.* FROM ai.interview_questions q
       WHERE q.active = TRUE AND q.display_order > $2 ${AIService.SKIP_IF_ALREADY_HAS_SQL}
       ORDER BY q.display_order ASC LIMIT 1`,
      [personId, afterDisplayOrder],
    );
    return row;
  }

  /**
   * Pedido explícito del usuario: "nada en el sistema debería ser fijo
   * sino todo depender de tablas dinámicas" — el modelo Formulario NO
   * puede tener su propia lista de antecedentes/opciones hardcodeada
   * en el código de la app, tiene que leer EXACTAMENTE la misma tabla
   * que ya gobierna al modelo Estructurado (ai.interview_questions,
   * editable desde admin-web) — así un cambio ahí (agregar una
   * pregunta, sumar una opción como pasó con los tipos de diabetes)
   * aparece solo en las dos vías, sin tocar código.
   */
  async listActiveInterviewQuestions(): Promise<{
    id: string;
    code: string;
    groupLabel: string | null;
    questionText: string;
    freeTextEnabled: boolean;
    options: string[] | null;
    asksDate: boolean;
    proposalType: string;
    catalogDomainCode: string | null;
    displayOrder: number;
  }[]> {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const rows = await queryRunner.query(
        `SELECT id, code, group_label, question_text, free_text_enabled, options,
                asks_date, proposal_type, catalog_domain_code, display_order
         FROM ai.interview_questions
         WHERE active = TRUE
         ORDER BY display_order ASC`,
      );
      return rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        code: r.code as string,
        groupLabel: r.group_label as string | null,
        questionText: r.question_text as string,
        freeTextEnabled: r.free_text_enabled as boolean,
        options: r.options as string[] | null,
        asksDate: r.asks_date as boolean,
        proposalType: r.proposal_type as string,
        catalogDomainCode: r.catalog_domain_code as string | null,
        displayOrder: r.display_order as number,
      }));
    });
  }

  private async getQuestionById(queryRunner: QueryRunner, id: string) {
    const [row] = await queryRunner.query(
      `SELECT * FROM ai.interview_questions WHERE id = $1`,
      [id],
    );
    return row;
  }

  /** Normaliza core.persons.preferred_lang (CHAR(5), ej. "es"/"en-US") a uno de los 4 idiomas soportados — cualquier otro valor cae a español. */
  private static resolveLang(raw: string | null | undefined): SupportedLang {
    const code = (raw ?? 'es').trim().slice(0, 2).toLowerCase();
    return (['es', 'en', 'pt', 'fr'] as const).includes(code as SupportedLang) ? (code as SupportedLang) : 'es';
  }

  private async getPersonLanguage(queryRunner: QueryRunner, personId: string): Promise<SupportedLang> {
    const [row] = await queryRunner.query(
      `SELECT preferred_lang FROM core.persons WHERE id = $1`,
      [personId],
    );
    return AIService.resolveLang(row?.preferred_lang);
  }

  /**
   * Pedido explícito del usuario: que la IA valide/corrija lo que se
   * dice contra lo que YA existe en el catálogo (ej. "asmi" -> "Asma")
   * en vez de guardar cualquier cosa tal cual se dijo. Se acota a 60
   * nombres para no inflar el prompt — alcanza de sobra para que el
   * modelo reconozca coincidencias, no hace falta la lista completa.
   */
  private async getKnownCatalogNames(
    queryRunner: QueryRunner,
    catalogDomainCode: string | null,
  ): Promise<string[]> {
    if (!catalogDomainCode) return [];
    const rows = await queryRunner.query(
      `SELECT cv.label_es FROM params.catalog_values cv
       JOIN params.domain_catalogs dc ON dc.id = cv.domain_id
       WHERE dc.code = $1 AND cv.active = TRUE AND cv.lifecycle_status IN ('ACTIVE', 'APPROVED')
       ORDER BY cv.display_order ASC LIMIT 60`,
      [catalogDomainCode],
    );
    return rows.map((r: { label_es: string }) => r.label_es);
  }

  /**
   * Pedido explícito del usuario: las preguntas condicionantes tienen
   * que pedir CLARAMENTE "indique sí o no" primero — el detalle/fecha
   * se piden después, solo si contesta que sí (ver formatFollowupPrompt).
   * Medicamentos es la excepción: es un pedido abierto, no un sí/no.
   */
  private formatStructuredQuestion(
    question: {
      question_text: string;
      question_text_en?: string | null;
      question_text_pt?: string | null;
      question_text_fr?: string | null;
      proposal_type: string;
    },
    language: SupportedLang = 'es',
  ): string {
    const text =
      language === 'en' ? (question.question_text_en ?? question.question_text) :
      language === 'pt' ? (question.question_text_pt ?? question.question_text) :
      language === 'fr' ? (question.question_text_fr ?? question.question_text) :
      question.question_text;
    if (question.proposal_type === 'MEDICATION') {
      return text;
    }
    return `${text} ${AIService.t('yesNoSuffix', language)}`;
  }

  /**
   * Turno de seguimiento: pide puntualmente lo que faltó tras un "sí".
   * Bug real reportado en vivo: cuando la pregunta tiene opciones
   * cerradas (ej. los 3 tipos de diabetes), antes no se mostraban acá
   * — la persona no sabía qué contestar y terminaba inventando una
   * variante que no existe en el catálogo ("diabetes tipo 3").
   */
  private formatFollowupPrompt(
    missingDetail: boolean,
    missingDate: boolean,
    options?: string[] | null,
    language: SupportedLang = 'es',
  ): string {
    // Pedido explícito del usuario: mostrar las opciones numeradas y
    // poder contestar con el nombre O con el número de la lista (ver
    // matchOption). Un solo "\n" entre ítems — no "\n\n" — para que se
    // lea como una lista corrida, sin pausas largas entre cada opción
    // (ver _speakableText en el cliente móvil). Las opciones en sí
    // (nombres de catálogo) quedan en español — mismo criterio que
    // "detail" en interpretStructuredAnswer, ver comentario ahí.
    const optionsHint = missingDetail && options?.length
      ? ` ${AIService.t('optionsLabel', language)}\n${options.map((o, i) => `${i + 1} - ${o}`).join('\n')}`
      : '';
    if (missingDetail && missingDate) return `${AIService.t('whichOneAndDate', language)}${optionsHint}`;
    if (missingDetail) return `${AIService.t('whichOne', language)}${optionsHint}`;
    return AIService.t('whenApprox', language);
  }

  private static readonly ACCENT_MAP: Record<string, string> = {
    á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', ü: 'u',
    Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N', Ü: 'U',
  };

  /**
   * Reemplazo directo carácter por carácter (no NFD) para que el texto
   * resultante tenga el mismo largo/índices que el original — así los
   * offsets de un regex.exec() sobre el texto normalizado siguen siendo
   * válidos para recortar el texto ORIGINAL (con acentos) más adelante.
   * Mismo criterio que _stripAccents() en health_assistant_screen.dart.
   */
  private static stripAccents(text: string): string {
    return text.replace(/[áéíóúñüÁÉÍÓÚÑÜ]/g, (c) => AIService.ACCENT_MAP[c] ?? c);
  }

  // \b no es Unicode-aware en JS por defecto, así que "sí" (con tilde)
  // no matcheaba contra \bsi\b — bug confirmado, mismo que ya se había
  // encontrado y arreglado del lado del cliente móvil. Se normalizan
  // acentos ANTES de probar el regex (ver stripAccents).
  private static readonly AFFIRMATIVE_RE =
    /\b(si|ok|okay|dale|correcto|correcta|confirmo|confirmar|confirmado|confirma|acepto|aceptar|acepta|exacto|afirmativo|listo|asi es|perfecto)\b/i;
  private static readonly NEGATIVE_RE =
    /\b(no|nunca|jamas|cancelar|rechazar|incorrecto|negativo|para nada)\b/i;
  private static readonly YEAR_RE = /\b(19|20)\d{2}\b/;
  private static readonly FULL_DATE_RE = /\b(\d{1,2})[/-](\d{1,2})[/-]((?:19|20)\d{2})\b/;

  // Bug real reportado en vivo: en el turno de seguimiento (ya se dijo
  // "sí"), si la persona se da cuenta que se equivocó y quiere volver
  // atrás ("no, me confundí", "en realidad no tuve"), el flujo se
  // quedaba esperando el detalle para siempre — no había forma de
  // retractarse. Esto se chequea ANTES que cualquier otra cosa en el
  // turno de seguimiento.
  private static readonly RETRACTION_RE =
    /\b(me confundi|me equivoque|no era eso|no fue asi|cambie de idea|en realidad no|mejor no|no tuve|no tengo|olvidalo|dejalo asi no)\b/i;

  private isRetraction(answerText: string): boolean {
    const normalized = AIService.stripAccents(answerText.trim().toLowerCase());
    if (AIService.RETRACTION_RE.test(normalized)) return true;
    // Un "no" corto y limpio (sin nada más) también cuenta como
    // retractarse — no hace falta que diga la frase completa.
    return AIService.NEGATIVE_RE.test(normalized) && !AIService.AFFIRMATIVE_RE.test(normalized)
      && normalized.split(/\s+/).length <= 4;
  }

  /**
   * Pedido explícito del usuario: poder elegir una opción por su
   * nombre O por el número de la lista (ver formatFollowupPrompt, que
   * ahora las numera). Solo matchea 1-2 dígitos sueltos — un año de 4
   * dígitos ("2015") nunca se confunde con un número de opción.
   */
  private static matchOption(text: string, options: string[]): string | null {
    const trimmed = text.trim();
    const normalized = AIService.stripAccents(trimmed);
    const bareNumber = normalized.match(/^\D*(\d{1,2})\D*$/);
    const wordedNumber = normalized.match(/\b(?:opcion|numero)\s*(\d{1,2})\b/i);
    const numberMatch = bareNumber ?? wordedNumber;
    if (numberMatch) {
      const idx = parseInt(numberMatch[1], 10) - 1;
      if (idx >= 0 && idx < options.length) return options[idx];
    }
    return options.find((o) => trimmed.toLowerCase().includes(o.toLowerCase())) ?? null;
  }

  // Bug real reportado en vivo (por voz): frases que no son una
  // respuesta real ("te escucha", "hola, ¿me escuchás?") se estaban
  // aceptando como si fueran el nombre de una condición/antecedente,
  // creando entradas de catálogo con basura. No decide "sí/no" — solo
  // filtra si el DETALLE en sí mismo parece plausible.
  private static readonly FILLER_RE =
    /\b(escuchas|escuchame|hola|perdon|un segundo|espera|no se|no entendi|que decis|como)\b/i;

  /**
   * Decide si un texto libre es plausible como detalle de un
   * antecedente (nombre de condición/cirugía/etc.) o si hay que
   * descartarlo (null) por parecer ruido/muletilla en vez de una
   * respuesta real. Si la pregunta tiene opciones cerradas, NUNCA
   * acepta texto libre — o matchea una opción real, o queda sin
   * detalle (missing), nunca se inventa una variante nueva.
   */
  private resolveDetailCandidate(
    rawText: string,
    options: string[] | null | undefined,
  ): string | null {
    const text = rawText.trim();
    if (!text) return null;

    if (options?.length) {
      return AIService.matchOption(text, options);
    }

    const normalized = AIService.stripAccents(text.toLowerCase());
    const looksLikeFiller = AIService.FILLER_RE.test(normalized) || text.split(/\s+/).length > 8;
    return looksLikeFiller ? null : text;
  }

  /**
   * Intenta interpretar el turno "indique sí o no" SIN llamar a OpenAI.
   * Devuelve null si es ambiguo (ni sí/no claro ni una opción reconocida)
   * y hace falta interpretarlo con IA (ver interpretStructuredAnswer).
   * No decide acá si falta detalle/fecha — eso lo resuelve el llamador
   * comparando contra los flags de la pregunta (free_text_enabled/asks_date).
   */
  private tryDeterministicParse(
    answerText: string,
    question: { free_text_enabled: boolean; options: string[] | null; asks_date: boolean },
    language: SupportedLang = 'es',
    birthDate?: string,
  ): { applicable: boolean; detail: string | null; dateRaw: string | null; date: string | null } | null {
    const text = answerText.trim();
    if (!text) return null;
    const normalized = AIService.stripAccents(text);

    // Toque de botón (ver matchesYesNo): igualdad exacta contra el
    // label del idioma actual — se resuelve gratis en cualquier idioma,
    // sin pasar por la regla en español (Spanish-only) ni por la IA.
    const exactYesNo = AIService.matchesYesNo(text, language);
    if (exactYesNo === 'no') {
      return { applicable: false, detail: null, dateRaw: null, date: null };
    }
    if (exactYesNo === 'yes') {
      return { applicable: true, detail: null, dateRaw: null, date: null };
    }

    if (AIService.NEGATIVE_RE.test(normalized) && !AIService.AFFIRMATIVE_RE.test(normalized)) {
      return { applicable: false, detail: null, dateRaw: null, date: null };
    }

    const matchedOption = question.options?.length ? AIService.matchOption(text, question.options) : null;

    const affirmativeMatch = AIService.AFFIRMATIVE_RE.exec(normalized);
    if (!matchedOption && !affirmativeMatch) {
      // Ni "sí"/"no" claro ni una opción reconocida — ambiguo, mejor
      // que lo resuelva la IA en vez de arriesgar un parseo incorrecto.
      return null;
    }

    // Bug real reportado en vivo (dos veces): con preguntas SIN
    // opciones, se aceptaba localmente cualquier texto después de "sí"
    // como si fuera el nombre real de una enfermedad — un filtro de
    // muletillas fijo no alcanza para frases de ruido impredecibles
    // ("anda mientras", captadas hablando con otra persona al lado).
    // Con opciones se sigue resolviendo gratis (matchedOption, ya
    // validado arriba). SIN opciones, si hay texto libre después del
    // "sí", ya NO se intenta extraerlo acá: se devuelve null para que
    // interpretStructuredAnswer (IA) valide si el texto realmente
    // nombra una condición antes de aceptarlo — más caro por turno,
    // pero evita que cualquier ruido termine como alerta médica real.
    if (!matchedOption && affirmativeMatch && !question.options?.length) {
      const rest = text.slice(affirmativeMatch.index + affirmativeMatch[0].length).replace(/^[,.\s]+/, '').trim();
      if (rest) return null;
    }

    let dateRaw: string | null = null;
    let date: string | null = null;
    if (question.asks_date) {
      const fullDate = AIService.FULL_DATE_RE.exec(text);
      if (fullDate) {
        dateRaw = fullDate[0];
        date = `${fullDate[3]}-${fullDate[2].padStart(2, '0')}-${fullDate[1].padStart(2, '0')}`;
      } else {
        const year = AIService.YEAR_RE.exec(text);
        if (year) {
          dateRaw = year[0];
          date = `${year[0]}-01-01`;
        } else {
          // Pedido explícito del usuario: "esto debería estar en
          // cualquier indicación... alguien puede decir que toma un
          // medicamento desde los 10 años" — sin fecha ni año
          // explícitos, se prueba una expresión relativa a la edad
          // contra la fecha de nacimiento ya conocida del viajero.
          const resolved = AIService.resolveAgeRelativeDate(text, birthDate);
          if (resolved) {
            dateRaw = text;
            date = resolved;
          }
        }
      }
    }

    return { applicable: true, detail: matchedOption ?? null, dateRaw, date };
  }

  /**
   * Turno de seguimiento (pending_step = 'FOLLOWUP'): ya se sabe que la
   * respuesta es afirmativa, esto es puramente "¿cuál?"/"¿qué fecha?" —
   * no se testea sí/no acá. Se resuelve determinísticamente (costo $0):
   * se separa una fecha reconocible del texto si hace falta, y lo que
   * queda es el detalle. Si no se reconoce una fecha en el texto, se
   * deja sin fecha (mejor el antecedente sin fecha que no cargarlo).
   */
  private parseFollowupAnswer(
    question: { free_text_enabled: boolean; options: string[] | null; asks_date: boolean },
    answerText: string,
    priorAnswers: { detail?: string | null; dateRaw?: string | null; date?: string | null },
    birthDate?: string,
  ): { detail: string | null; dateRaw: string | null; date: string | null } {
    const text = answerText.trim();
    if (!text) return { detail: null, dateRaw: null, date: null };

    const needsDetail = question.free_text_enabled && !priorAnswers.detail;
    const needsDate = question.asks_date && !priorAnswers.dateRaw && !priorAnswers.date;

    let dateRaw: string | null = null;
    let date: string | null = null;
    let remainder = text;
    if (needsDate) {
      const fullDate = AIService.FULL_DATE_RE.exec(text);
      if (fullDate) {
        dateRaw = fullDate[0];
        date = `${fullDate[3]}-${fullDate[2].padStart(2, '0')}-${fullDate[1].padStart(2, '0')}`;
        remainder = text.replace(fullDate[0], '');
      } else {
        const year = AIService.YEAR_RE.exec(text);
        if (year) {
          dateRaw = year[0];
          date = `${year[0]}-01-01`;
          remainder = text.replace(year[0], '');
        } else {
          // Mismo criterio que tryDeterministicParse: "desde los 10
          // años" también tiene que resolverse contra la fecha de
          // nacimiento ya conocida, no quedar como texto crudo.
          const resolved = AIService.resolveAgeRelativeDate(text, birthDate);
          if (resolved) {
            dateRaw = text;
            date = resolved;
            remainder = '';
          }
        }
      }
    }
    remainder = remainder
      .replace(/\b(desde|en|del|de)\b/gi, ' ')
      .replace(/[,.]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // Mismo criterio que tryDeterministicParse: con opciones cerradas
    // nunca se acepta texto libre como si fuera una opción válida, y
    // sin opciones se descarta lo que parece muletilla/ruido en vez de
    // una respuesta real (bug real: "te escucha" terminaba como nombre
    // de una enfermedad nueva en el catálogo).
    const candidateText = remainder || (dateRaw ? '' : text);
    const detail = needsDetail ? this.resolveDetailCandidate(candidateText, question.options) : null;
    return { detail, dateRaw, date };
  }

  /**
   * Bug real reportado en vivo: en el modelo Estructurado, una condición
   * quedaba SIEMPRE como "ACTIVE" (default en applyConfirmedProposal si
   * no viene statusCode) — nunca se determinaba si era algo crónico de
   * por vida (diabetes, hipertensión, asma) o un evento puntual, así que
   * la ficha compartida nunca las mostraba en "Enfermedades Crónicas".
   * El modelo Clásico sí se lo pregunta a la IA (ver SYSTEM_PROMPT); acá
   * no hay llamado a IA para la mayoría de los turnos, así que se
   * resuelve con un heurístico sobre el texto de la pregunta — cubre
   * los ítems de la LISTA DE REFERENCIA que son crónicos por su propia
   * naturaleza (diabetes, hipertensión, EPOC, etc.), sin inventar una
   * clasificación para los ambiguos (enfermedad oncológica, hepatitis,
   * enfermedad cardiovascular general), que quedan en ACTIVE como antes.
   */
  private static inferChronicStatus(questionText: string): 'CHRONIC' | undefined {
    const normalized = AIService.stripAccents(questionText.toLowerCase());
    const chronicKeywords = [
      'cronic', 'diabetes', 'hipertension arterial', 'parkinson', 'gota',
      'hematologica', 'hemofilia', 'fibrilacion auricular',
      'enfermedad metabolica', 'dialisis', 'insuficiencia renal',
    ];
    return chronicKeywords.some((kw) => normalized.includes(kw)) ? 'CHRONIC' : undefined;
  }

  private buildStructuredProposal(
    question: { id: string; proposal_type: string; question_text: string; condition_label?: string | null },
    parsed: { detail: string | null; dateRaw: string | null; date: string | null },
  ): AIProposalCandidate {
    // Bug real reportado en vivo: sin ningún detalle propio (ej. solo
    // confirma "sí" a "¿Padece de gota?"), esto guardaba el TEXTO DE LA
    // PREGUNTA tal cual como nombre de la enfermedad — quedaba
    // "¿Padece de gota?" en la ficha en vez de "Gota". condition_label
    // (editable desde admin-web, ai.interview_questions) es la etiqueta
    // limpia a usar en ese caso; si no está cargada, cae al criterio
    // anterior como último recurso.
    const label = parsed.detail ?? question.condition_label ?? question.question_text.replace(/[¿?]/g, '').trim();
    const base = { confidence: 0.9 };
    switch (question.proposal_type) {
      case 'CONDITION':
        return {
          ...base,
          proposalType: 'CONDITION',
          data: {
            conditionName: label,
            diagnosedDateRaw: parsed.dateRaw ?? undefined,
            diagnosedDate: parsed.date ?? undefined,
            statusCode: AIService.inferChronicStatus(question.question_text),
            sourceQuestionId: question.id,
          },
        };
      case 'SURGERY':
        return {
          ...base,
          proposalType: 'SURGERY',
          data: {
            procedureName: label,
            performedDateRaw: parsed.dateRaw ?? undefined,
            performedDate: parsed.date ?? undefined,
            sourceQuestionId: question.id,
          },
        };
      case 'MEDICATION':
        return {
          ...base,
          proposalType: 'MEDICATION',
          data: {
            genericName: label,
            prescribedDateRaw: parsed.dateRaw ?? undefined,
            prescribedDate: parsed.date ?? undefined,
          },
        };
      case 'IMPLANT_DEVICE':
        return {
          ...base,
          proposalType: 'IMPLANT_DEVICE',
          data: { deviceName: label, implantedAtRaw: parsed.dateRaw ?? undefined, implantedAt: parsed.date ?? undefined },
        };
      default:
        return {
          ...base,
          proposalType: 'ALLERGY',
          data: { allergenName: label, allergenType: 'OTHER', severity: 'MODERATE' },
        };
    }
  }

  /**
   * Confirma una propuesta pendiente e inserta el registro clínico real
   * (nunca antes de este paso). gap #46: clinical.allergies/conditions/
   * medications tienen un trigger que rechaza duplicados (23505) —
   * mapPgError lo traduce a 409 en vez de un 500 genérico.
   */
  async confirmProposal(personId: string, proposalId: string) {
    try {
      return await this.confirmProposalInternal(personId, proposalId);
    } catch (error) {
      mapPgError(error);
    }
  }

  private async confirmProposalInternal(personId: string, proposalId: string) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const [proposal] = await queryRunner.query(
        `SELECT id, proposal_type, json_data, status
         FROM ai.proposals
         WHERE id = $1 AND person_id = $2`,
        [proposalId, personId],
      );
      if (!proposal) {
        throw new BadRequestException('Propuesta no encontrada');
      }
      if (proposal.status !== 'PENDING_CONFIRMATION') {
        throw new BadRequestException('Esta propuesta ya fue procesada');
      }
      return this.applyConfirmedProposal(queryRunner, personId, proposal);
    });
  }

  /**
   * Pedido explícito del usuario: la entrevista ya no pide confirmar
   * antecedente por antecedente — se van anotando como PENDING_CONFIRMATION
   * a medida que la charla avanza (igual que siempre, ver
   * confirmProposalInternal) y recién se confirman TODOS JUNTOS cuando
   * el viajero confirma el resumen final.
   *
   * Bug real reportado en vivo: la primera versión de esto revertía TODO
   * el lote si UN solo proposal fallaba (ej. la IA propuso "diabetes" dos
   * veces en la misma charla — la segunda chocaba con el trigger
   * anti-duplicados de clinical.conditions) — el viajero perdía TODO lo
   * hablado en la entrevista por un solo conflicto, sin explicación
   * clara. Ahora cada proposal corre en su propio SAVEPOINT: si uno
   * choca con un conflicto esperado (duplicado — ver isSkippableConflict),
   * se descarta solo ESE y el resto del lote sigue confirmándose
   * normal. Un error inesperado (no duplicado) sí aborta todo el lote —
   * ahí sí puede ser un bug real que no hay que ocultar.
   */
  async confirmAllProposals(personId: string, conversationId: string) {
    try {
      return await this.txManager.runInTransaction((queryRunner) =>
        this.confirmAllProposalsInTx(queryRunner, personId, conversationId),
      );
    } catch (error) {
      mapPgError(error);
    }
  }

  /**
   * Cuerpo de confirmAllProposals separado para poder llamarlo con un
   * queryRunner YA ABIERTO — pedido explícito del usuario: cuando la IA
   * detecta "quiero pausar" en medio del modelo Estructurado
   * (structuredIntakeChat), hay que confirmar todo lo pendiente EN LA
   * MISMA transacción del turno actual, no abrir una transacción nueva
   * anidada (txManager.runInTransaction no soporta reentrancia).
   */
  private async confirmAllProposalsInTx(
    queryRunner: QueryRunner,
    personId: string,
    conversationId: string,
  ) {
    const pending = await queryRunner.query(
      `SELECT id, proposal_type, json_data, status
       FROM ai.proposals
       WHERE person_id = $1 AND conversation_id = $2 AND status = 'PENDING_CONFIRMATION'
       ORDER BY created_at ASC`,
      [personId, conversationId],
    );
    const results: Array<{ proposalId: string; resultingId: string; resultingTable: string }> = [];
    const skipped: Array<{
      proposalId: string;
      proposalType: string;
      reason: string;
      /**
       * Pedido explícito del usuario: cuando el conflicto es "ya tenés
       * un valor cargado para esta pregunta" (ver ConditionConflictError),
       * la app puede ofrecerle al viajero confirmar el reemplazo llamando
       * a PATCH /me/health-assistant/conditions/:id con estos datos, en
       * vez de perder el dato nuevo en silencio.
       */
      conflict?: {
        existingConditionId: string;
        existingConditionName: string;
        newConditionName: string;
        newDateRaw: string | null;
      };
    }> = [];
    let savepointCounter = 0;

    const runOne = async (proposal: {
      id: string;
      proposal_type: string;
      json_data: Record<string, unknown>;
    }) => {
      savepointCounter += 1;
      const savepoint = `confirm_all_${savepointCounter}`;
      await queryRunner.query(`SAVEPOINT ${savepoint}`);
      try {
        results.push(await this.applyConfirmedProposal(queryRunner, personId, proposal));
        await queryRunner.query(`RELEASE SAVEPOINT ${savepoint}`);
      } catch (error) {
        if (error instanceof ConditionConflictError) {
          await queryRunner.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          skipped.push({
            proposalId: proposal.id,
            proposalType: proposal.proposal_type,
            reason: `Ya tenías "${error.existingConditionName}" cargada`,
            conflict: {
              existingConditionId: error.existingConditionId,
              existingConditionName: error.existingConditionName,
              newConditionName: error.newConditionName,
              newDateRaw: error.newDateRaw ?? null,
            },
          });
          await queryRunner.query(
            `UPDATE ai.proposals SET status = 'REJECTED', rejected_at = NOW() WHERE id = $1`,
            [proposal.id],
          );
          return;
        }
        const reason = isSkippableConflict(error);
        if (reason == null) throw error;
        await queryRunner.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        skipped.push({ proposalId: proposal.id, proposalType: proposal.proposal_type, reason });
        await queryRunner.query(
          `UPDATE ai.proposals SET status = 'REJECTED', rejected_at = NOW() WHERE id = $1`,
          [proposal.id],
        );
      }
    };

    // Bug real reportado en vivo: peso/altura/fecha de nacimiento/
    // sexo/grupo sanguíneo no son "una entrada por turno" — son los
    // mismos datos básicos, y clinical.vitals_history es histórica
    // a propósito (sin trigger anti-duplicados), así que cada
    // VITALS proposal de la misma charla generaba una fila nueva de
    // verdad ("se cargaron las alturas varias veces"). Se combinan
    // acá en UN solo registro final (último valor no nulo por campo
    // gana, mismo criterio que getPersonContext/VitalsTab) antes de
    // guardar — nunca puede quedar duplicado sin importar cuántas
    // veces la IA haya vuelto a proponerlo.
    const vitalsProposals = pending.filter((p: { proposal_type: string }) => p.proposal_type === 'VITALS');
    const otherProposals = pending.filter((p: { proposal_type: string }) => p.proposal_type !== 'VITALS');

    if (vitalsProposals.length > 0) {
      const mergedData: Record<string, unknown> = {};
      for (const p of vitalsProposals) {
        for (const [key, value] of Object.entries(p.json_data as Record<string, unknown>)) {
          if (value != null) mergedData[key] = value;
        }
      }
      const primary = vitalsProposals[vitalsProposals.length - 1];
      await runOne({ id: primary.id, proposal_type: 'VITALS', json_data: mergedData });

      const confirmedPrimary = results.find((r) => r.proposalId === primary.id);
      const otherIds = vitalsProposals.map((p: { id: string }) => p.id).filter((id: string) => id !== primary.id);
      if (confirmedPrimary && otherIds.length > 0) {
        await queryRunner.query(
          `UPDATE ai.proposals
           SET status = 'CONFIRMED', confirmed_at = NOW(),
               resulting_record_id = $2, resulting_record_table = $3
           WHERE id = ANY($1)`,
          [otherIds, confirmedPrimary.resultingId, confirmedPrimary.resultingTable],
        );
      }
    }

    // Bug real reportado en vivo: en una charla larga, cuando el
    // viajero amplía o corrige algo que ya había propuesto antes en la
    // MISMA charla (ej. dijo "hepatitis B" y más tarde "ya se resolvió"
    // — el prompt le pide a la IA armar un proposal NUEVO con el dato
    // actualizado, ver SYSTEM_PROMPT), acá se intentaban insertar los
    // DOS proposals como filas separadas — el primero (incompleto)
    // entraba bien, y el segundo (con la corrección) chocaba con el
    // trigger anti-duplicados de clinical.* (prevent_duplicate_condition
    // y afines, agregados esta misma sesión para otro bug) y quedaba
    // REJECTED, perdiendo en silencio justo el dato corregido/ampliado
    // (la fecha, el estado "resuelta", la dosis) mientras la versión
    // vieja e incompleta era la que quedaba guardada. Mismo criterio que
    // ya se usa arriba para VITALS: agrupar por el mismo antecedente
    // dentro de esta charla, combinar los campos (el valor no nulo más
    // reciente gana) y guardar UNA sola vez — nunca dos filas separadas
    // ni una corrección perdida.
    const mergeKeyFor = (proposal: { proposal_type: string; json_data: Record<string, unknown> }): string | null => {
      const data = proposal.json_data;
      const norm = (v: unknown) => AIService.stripAccents(String(v ?? '').toLowerCase().trim());
      switch (proposal.proposal_type) {
        case 'CONDITION':
          return `CONDITION|${norm(data.conditionName)}`;
        case 'MEDICATION':
          return `MEDICATION|${norm(data.genericName)}`;
        case 'ALLERGY':
          return `ALLERGY|${norm(data.allergenName)}`;
        case 'SURGERY':
          return `SURGERY|${norm(data.procedureName)}|${norm(data.performedDate ?? data.performedDateRaw)}`;
        case 'IMPLANT_DEVICE':
          return `IMPLANT_DEVICE|${norm(data.deviceName)}|${norm(data.implantedAt ?? data.implantedAtRaw)}`;
        default:
          return null;
      }
    };

    const groups = new Map<string, typeof otherProposals>();
    const ungrouped: typeof otherProposals = [];
    for (const proposal of otherProposals) {
      const key = mergeKeyFor(proposal);
      if (key == null || key.endsWith('|')) {
        ungrouped.push(proposal);
        continue;
      }
      const group = groups.get(key);
      if (group) group.push(proposal);
      else groups.set(key, [proposal]);
    }

    for (const proposal of ungrouped) {
      await runOne(proposal);
    }

    for (const group of groups.values()) {
      if (group.length === 1) {
        await runOne(group[0]);
        continue;
      }
      const mergedData: Record<string, unknown> = {};
      for (const p of group) {
        for (const [key, value] of Object.entries(p.json_data as Record<string, unknown>)) {
          if (value != null) mergedData[key] = value;
        }
      }
      const primary = group[group.length - 1];
      await runOne({ id: primary.id, proposal_type: primary.proposal_type, json_data: mergedData });

      const confirmedPrimary = results.find((r) => r.proposalId === primary.id);
      const otherIds = group
        .map((p: { id: string }) => p.id)
        .filter((id: string) => id !== primary.id);
      if (confirmedPrimary && otherIds.length > 0) {
        await queryRunner.query(
          `UPDATE ai.proposals
           SET status = 'CONFIRMED', confirmed_at = NOW(),
               resulting_record_id = $2, resulting_record_table = $3
           WHERE id = ANY($1)`,
          [otherIds, confirmedPrimary.resultingId, confirmedPrimary.resultingTable],
        );
      }
    }

    return { confirmed: results.length, results, skipped };
  }

  private async applyConfirmedProposal(
    queryRunner: QueryRunner,
    personId: string,
    proposal: { id: string; proposal_type: string; json_data: Record<string, any> },
  ) {
    const data = proposal.json_data;
    let resultingId: string;
    let resultingTable: string;


      if (proposal.proposal_type === 'MEDICATION') {
        // Historial de Salud — Fase 2: la IA sigue proponiendo texto
        // libre, pero acá se resuelve/crea contra el catálogo MEDICATION
        // (CatalogResolutionService) para que quede gobernado (revisión/
        // fusión de duplicados desde catalogs-admin), sin bloquear la
        // carga si el medicamento todavía no está en la tabla.
        const medicationCatalog = await this.catalogResolution.resolveOrCreate(
          'MEDICATION',
          data.genericName,
        );
        const [row] = await queryRunner.query(
          `INSERT INTO clinical.medications
             (person_id, generic_name, medication_catalog_id, brand_name, manufacturer, dose_amount, dose_unit_id,
              prescribed_date, is_current, canonical_status_id, confirmation_status_id, certification_status_id,
              provenance_id, ai_assisted, ai_completed_fields,
              member_confirmed, member_confirmed_at, requires_member_confirmation, notes)
           VALUES (
             $1, core.encrypt_pii($2), $3, core.encrypt_pii($4), core.encrypt_pii($5), $6,
             CASE WHEN $7::text IS NULL THEN NULL ELSE params.catalog_id('DOSE_UNIT', $7) END,
             $8::date,
             $9,
             params.catalog_id('CANONICAL_STATUS', 'PROVISIONAL'),
             params.catalog_id('CONFIRMATION_STATUS', 'MEMBER_CONFIRMED'),
             params.catalog_id('CERTIFICATION_STATUS', 'UNCERTIFIED'),
             params.catalog_id('PROVENANCE_TYPE', 'AI_ASSISTED'),
             TRUE, $10::jsonb, TRUE, NOW(), FALSE, core.encrypt_pii($11)
           )
           RETURNING id`,
          [
            personId,
            data.genericName,
            medicationCatalog.id,
            data.brandName ?? null,
            data.manufacturer ?? null,
            data.doseAmount ?? null,
            data.doseUnit ?? null,
            data.prescribedDate ?? null,
            data.isCurrent ?? true,
            JSON.stringify(data),
            data.notes ?? null,
          ],
        );
        resultingId = row.id;
        resultingTable = 'clinical.medications';
      } else if (proposal.proposal_type === 'ALLERGY') {
        const allergenCatalog = await this.catalogResolution.resolveOrCreate(
          'ALLERGEN',
          data.allergenName,
        );
        // Pedido explícito del usuario: el sistema nunca puede dejar
        // pendiente un campo obligatorio en la base — allergen_type_id/
        // severity_id son NOT NULL en clinical.allergies (005_clinical.sql),
        // pero el schema de la IA los permite null (para no trabar la
        // charla insistiendo). Si igual llegan null acá (la IA no
        // preguntó, o el viajero no contestó), se usa el mismo default
        // que ya se le pide a la IA en el prompt — así el INSERT nunca
        // falla por esta constraint, pase lo que pase del lado del modelo.
        const [row] = await queryRunner.query(
          `INSERT INTO clinical.allergies
             (person_id, allergen_name, allergen_catalog_id, allergen_type_id, severity_id,
              canonical_status_id, confirmation_status_id, certification_status_id,
              provenance_id, ai_assisted, ai_completed_fields,
              member_confirmed, member_confirmed_at, requires_member_confirmation, notes)
           VALUES (
             $1, core.encrypt_pii($2), $3,
             params.catalog_id('ALLERGEN_TYPE', $4),
             params.catalog_id('REACTION_SEVERITY', $5),
             params.catalog_id('CANONICAL_STATUS', 'PROVISIONAL'),
             params.catalog_id('CONFIRMATION_STATUS', 'MEMBER_CONFIRMED'),
             params.catalog_id('CERTIFICATION_STATUS', 'UNCERTIFIED'),
             params.catalog_id('PROVENANCE_TYPE', 'AI_ASSISTED'),
             TRUE, $6::jsonb, TRUE, NOW(), FALSE, core.encrypt_pii($7)
           )
           RETURNING id`,
          [
            personId,
            data.allergenName,
            allergenCatalog.id,
            data.allergenType ?? 'OTHER',
            data.severity ?? 'MODERATE',
            JSON.stringify(data),
            data.notes ?? null,
          ],
        );
        resultingId = row.id;
        resultingTable = 'clinical.allergies';
      } else if (proposal.proposal_type === 'CONDITION') {
        // Fecha aproximada: si el viajero solo dio mes/año o año, se
        // guarda con el día 1 en la columna DATE, pero el texto que
        // realmente dijo queda en notes SOLO si no se pudo resolver
        // ninguna fecha (ni completa, ni año, ni relativa a la edad —
        // ver parseFormDateWithAge). Pedido explícito del usuario:
        // "cuando dice desde los cinco años... no debería poner 'desde
        // los 5 años' en ningún lado" — si diagnosedDate ya tiene un
        // valor (aunque sea aproximado), repetir el texto crudo en
        // notes es ruido, no información nueva.
        const notes = data.diagnosedDateRaw && !data.diagnosedDate
          ? `Fecha declarada por el viajero: "${data.diagnosedDateRaw}".${data.notes ? ' ' + data.notes : ''}`
          : (data.notes ?? null);
        // Gap real: toda condición quedaba con status_id ACTIVE fijo —
        // "Neumonía" (resuelta) se veía igual que "Diabetes" (crónica).
        // CONDITION_STATUS ya tenía el valor CHRONIC sembrado, nunca se
        // usaba. Ver ai-provider.interface.ts (AIConditionProposalData.statusCode).
        const statusCode = data.statusCode ?? 'ACTIVE';
        const conditionCatalog = await this.catalogResolution.resolveOrCreate(
          'CONDITION_CATALOG',
          data.conditionName,
        );
        // gap real: el modelo Clásico nunca seteaba sourceQuestionId (no
        // tiene concepto de "pregunta"), así que el trigger de duplicado
        // por pregunta nunca lo protegía — ver resolveSourceQuestionIdByLabel.
        const sourceQuestionId = (data.sourceQuestionId as string | undefined)
          ?? await this.resolveSourceQuestionIdByLabel(queryRunner, conditionCatalog.labelEs);
        let row: { id: string };
        try {
          [row] = await queryRunner.query(
            `INSERT INTO clinical.conditions
               (person_id, condition_name, condition_catalog_id, status_id, diagnosed_at,
                canonical_status_id, confirmation_status_id, certification_status_id,
                provenance_id, member_confirmed, member_confirmed_at,
                requires_member_confirmation, notes, source_question_id)
             VALUES (
               $1, core.encrypt_pii($2), $6,
               params.catalog_id('CONDITION_STATUS', $5),
               $3::date,
               params.catalog_id('CANONICAL_STATUS', 'PROVISIONAL'),
               params.catalog_id('CONFIRMATION_STATUS', 'MEMBER_CONFIRMED'),
               params.catalog_id('CERTIFICATION_STATUS', 'UNCERTIFIED'),
               params.catalog_id('PROVENANCE_TYPE', 'AI_ASSISTED'),
               TRUE, NOW(), FALSE, core.encrypt_pii($4), $7
             )
             RETURNING id`,
            [personId, data.conditionName, data.diagnosedDate ?? null, notes, statusCode, conditionCatalog.id, sourceQuestionId ?? null],
          );
        } catch (error) {
          // Pedido explícito del usuario: en vez de perder el dato en
          // silencio (o tirar un error críptico) cuando choca con
          // trg_prevent_duplicate_condition_by_question, se busca la
          // condición existente que generó el conflicto y se relanza un
          // error enriquecido — confirmAllProposalsInTx lo captura y le
          // ofrece al viajero confirmar el reemplazo (ver ConditionConflictError).
          if (
            sourceQuestionId &&
            error instanceof QueryFailedError &&
            (error as QueryFailedError & { code?: string }).code === '23505'
          ) {
            const [existing] = await queryRunner.query(
              `SELECT id, core.decrypt_pii(condition_name) AS name
               FROM clinical.conditions
               WHERE person_id = $1 AND source_question_id = $2
                 AND active = TRUE AND deleted_at IS NULL`,
              [personId, sourceQuestionId],
            );
            if (existing) {
              throw new ConditionConflictError(
                existing.id,
                existing.name,
                data.conditionName as string,
                (data.diagnosedDateRaw as string | undefined) ?? (data.diagnosedDate as string | undefined),
              );
            }
          }
          throw error;
        }
        resultingId = row.id;
        resultingTable = 'clinical.conditions';
      } else if (proposal.proposal_type === 'IMPLANT_DEVICE') {
        // Mismo criterio que CONDITION: la nota solo aporta algo cuando
        // no se pudo resolver ninguna fecha en absoluto — si implantedAt
        // ya tiene un valor (completo, por año, o por edad), repetir el
        // texto crudo en notes es redundante.
        const notes = data.implantedAtRaw && !data.implantedAt
          ? `Fecha declarada por el viajero: "${data.implantedAtRaw}".${data.notes ? ' ' + data.notes : ''}`
          : (data.notes ?? null);
        const implantCatalog = await this.catalogResolution.resolveOrCreate(
          'IMPLANT_TYPE',
          data.deviceName,
        );
        const [row] = await queryRunner.query(
          `INSERT INTO clinical.implants_devices
             (person_id, device_name, device_type_id, implanted_at,
              canonical_status_id, confirmation_status_id, certification_status_id,
              provenance_id, member_confirmed, member_confirmed_at,
              requires_member_confirmation, notes)
           VALUES (
             $1, core.encrypt_pii($2), $5, $3::date,
             params.catalog_id('CANONICAL_STATUS', 'PROVISIONAL'),
             params.catalog_id('CONFIRMATION_STATUS', 'MEMBER_CONFIRMED'),
             params.catalog_id('CERTIFICATION_STATUS', 'UNCERTIFIED'),
             params.catalog_id('PROVENANCE_TYPE', 'AI_ASSISTED'),
             TRUE, NOW(), FALSE, core.encrypt_pii($4)
           )
           RETURNING id`,
          [personId, data.deviceName, data.implantedAt ?? null, notes, implantCatalog.id],
        );
        resultingId = row.id;
        resultingTable = 'clinical.implants_devices';
      } else if (proposal.proposal_type === 'SURGERY') {
        // performed_at es NOT NULL en el schema — si ni el viajero ni la
        // IA lograron precisar ninguna fecha (no debería pasar, el
        // prompt lo pide siempre), se dejar constancia explícita en vez
        // de insertar una fecha inventada silenciosa.
        const notes = data.performedDateRaw && !data.performedDate
          ? `Fecha declarada por el viajero: "${data.performedDateRaw}".${data.notes ? ' ' + data.notes : ''}`
          : !data.performedDate
            ? `Fecha de la cirugía no informada por el viajero.${data.notes ? ' ' + data.notes : ''}`
            : (data.notes ?? null);
        const surgeryCatalog = await this.catalogResolution.resolveOrCreate(
          'SURGERY_CATALOG',
          data.procedureName,
        );
        const [row] = await queryRunner.query(
          `INSERT INTO clinical.surgeries
             (person_id, procedure_name, procedure_catalog_id, performed_at,
              canonical_status_id, confirmation_status_id, certification_status_id,
              provenance_id, member_confirmed, member_confirmed_at,
              requires_member_confirmation, notes, source_question_id)
           VALUES (
             $1, core.encrypt_pii($2), $5, COALESCE($3::date, CURRENT_DATE),
             params.catalog_id('CANONICAL_STATUS', 'PROVISIONAL'),
             params.catalog_id('CONFIRMATION_STATUS', 'MEMBER_CONFIRMED'),
             params.catalog_id('CERTIFICATION_STATUS', 'UNCERTIFIED'),
             params.catalog_id('PROVENANCE_TYPE', 'AI_ASSISTED'),
             TRUE, NOW(), FALSE, core.encrypt_pii($4), $6
           )
           RETURNING id`,
          [personId, data.procedureName, data.performedDate ?? null, notes, surgeryCatalog.id, data.sourceQuestionId ?? null],
        );
        resultingId = row.id;
        resultingTable = 'clinical.surgeries';
      } else if (proposal.proposal_type === 'VITALS') {
        // clinical.vitals_history no tiene el trío de estados MTA-511 ni
        // member_confirmed (tabla más simple, ver 005_clinical.sql).
        // gap #57: sexo/grupo sanguíneo se agregan acá — sexo no es un
        // "signo vital" pero vive junto a peso/altura en el mismo
        // proposal (mismo turno de charla), así que se resuelve en la
        // misma rama: además del INSERT en vitals_history, un UPDATE en
        // core.persons.gender_id si vino genderCode.
        const bloodTypeId = data.bloodTypeCode
          ? (
              await queryRunner.query(
                `SELECT params.catalog_id('BLOOD_TYPE', $1) AS id`,
                [data.bloodTypeCode],
              )
            )[0]?.id
          : null;

        const [row] = await queryRunner.query(
          `INSERT INTO clinical.vitals_history
             (person_id, weight_kg, height_cm, blood_pressure_sys, blood_pressure_dia,
              blood_type_id, provenance_id)
           VALUES ($1, $2, $3, $4, $5, $6, params.catalog_id('PROVENANCE_TYPE', 'AI_ASSISTED'))
           RETURNING id`,
          [
            personId,
            data.weightKg ?? null,
            data.heightCm ?? null,
            data.bloodPressureSystolic ?? null,
            data.bloodPressureDiastolic ?? null,
            bloodTypeId,
          ],
        );
        resultingId = row.id;
        resultingTable = 'clinical.vitals_history';

        if (data.genderCode) {
          await queryRunner.query(
            `UPDATE core.persons
             SET gender_id = params.catalog_id('GENDER', $2)
             WHERE id = $1`,
            [personId, data.genderCode],
          );
        }
        if (data.birthDate) {
          // Fecha de nacimiento pedida explícitamente por el usuario en
          // el guion del asistente — vive en core.persons.birth_date
          // (usada también para calcular la edad en getPersonContext),
          // no en vitals_history.
          await queryRunner.query(
            `UPDATE core.persons SET birth_date = $2::date WHERE id = $1`,
            [personId, data.birthDate],
          );
        }
      } else {
        // LAB_RESULT — gap real encontrado en vivo: el prompt le pedía a
        // la IA "anotar" estudios recientes (análisis de sangre, etc.)
        // en la charla, pero no existía ningún proposalType para
        // guardarlos — la IA decía "anoto"/"queda registrado" y nada se
        // persistía nunca. clinical.lab_results ya tenía columnas para
        // los valores más comunes; custom_values (jsonb) guarda
        // cualquier otro resultado sin columna propia (ej. "protrombina
        // 95%") — no tiene columna de notas libres, así que "notes" y la
        // fecha declarada sin poder normalizar (performedDateRaw) se
        // agregan ahí también como entradas {name, value}.
        const customValues = AIService.dedupeLabCustomValues(data, [
          ...(data.customValues ?? []),
          ...(!data.performedDate && data.performedDateRaw
            ? [{ name: 'Fecha declarada', value: data.performedDateRaw }]
            : []),
          ...(data.notes ? [{ name: 'Notas', value: data.notes }] : []),
        ]);
        const performedAt = data.performedDate ?? null;
        const labName = data.labName ?? null;

        // Bug real reportado en vivo: "cuando le pido corregir un dato
        // vuelve a cargar un análisis" / "veo por duplicado el análisis
        // de sangre" — a diferencia de condiciones/alergias/medicamentos
        // (que tienen un trigger en la base que rechaza duplicados),
        // clinical.lab_results no tenía ninguno — cada confirmación
        // insertaba una fila nueva, incluso cuando era el MISMO estudio
        // (misma fecha + mismo nombre) ya cargado antes. Ahora se busca
        // primero un estudio existente con esa fecha+nombre; si ya
        // existe, se ACTUALIZA (los valores nuevos reemplazan a los
        // viejos vía COALESCE, lo no mencionado se conserva) en vez de
        // crear una fila aparte — esto también resuelve de raíz el caso
        // de "corregime la glucemia": la corrección ahora pisa el valor
        // viejo en la MISMA fila, no crea una fila nueva sin vincular.
        const [existing] = await queryRunner.query(
          `SELECT id, custom_values FROM clinical.lab_results
           WHERE person_id = $1 AND deleted_at IS NULL
             AND performed_at = COALESCE($2::date, CURRENT_DATE)
             AND ((lab_name IS NULL AND $3::text IS NULL) OR core.decrypt_pii(lab_name) = $3)`,
          [personId, performedAt, labName],
        );

        if (existing) {
          // Bug real reportado en vivo: concatenar custom_values (viejo
          // + nuevo) dejaba "Glucemia: 93" Y "Glucemia: 92" juntos tras
          // una corrección, en vez de que el valor nuevo reemplace al
          // viejo — mismo problema que se evitó en las columnas
          // numéricas con COALESCE, pero acá hacía falta a mano. Se
          // fusiona por nombre de campo: si ya existía un campo con ese
          // nombre (ej. "Notas"), el valor nuevo lo reemplaza; si es un
          // campo distinto, se agrega sin tocar el resto.
          const mergedByName = new Map<string, string>();
          for (const cv of (existing.custom_values ?? []) as { name: string; value: string }[]) {
            mergedByName.set(cv.name, cv.value);
          }
          for (const cv of customValues) {
            mergedByName.set(cv.name, cv.value);
          }
          const mergedCustomValues = Array.from(mergedByName, ([name, value]) => ({ name, value }));
          const [row] = await queryRunner.query(
            `UPDATE clinical.lab_results
             SET hemoglobin         = COALESCE($2, hemoglobin),
                 hematocrit         = COALESCE($3, hematocrit),
                 white_blood_cells  = COALESCE($4, white_blood_cells),
                 platelets          = COALESCE($5, platelets),
                 glucose_fasting    = COALESCE($6, glucose_fasting),
                 hba1c              = COALESCE($7, hba1c),
                 total_cholesterol  = COALESCE($8, total_cholesterol),
                 hdl_cholesterol    = COALESCE($9, hdl_cholesterol),
                 ldl_cholesterol    = COALESCE($10, ldl_cholesterol),
                 triglycerides      = COALESCE($11, triglycerides),
                 creatinine         = COALESCE($12, creatinine),
                 pt_inr             = COALESCE($13, pt_inr),
                 aptt               = COALESCE($14, aptt),
                 custom_values      = $15::jsonb
             WHERE id = $1
             RETURNING id`,
            [
              existing.id,
              data.hemoglobin ?? null,
              data.hematocrit ?? null,
              data.whiteBloodCells ?? null,
              data.platelets ?? null,
              data.glucoseFasting ?? null,
              data.hba1c ?? null,
              data.totalCholesterol ?? null,
              data.hdlCholesterol ?? null,
              data.ldlCholesterol ?? null,
              data.triglycerides ?? null,
              data.creatinine ?? null,
              data.ptInr ?? null,
              data.aptt ?? null,
              JSON.stringify(mergedCustomValues),
            ],
          );
          resultingId = row.id;
          resultingTable = 'clinical.lab_results';
        } else {
          const [row] = await queryRunner.query(
            `INSERT INTO clinical.lab_results
               (person_id, performed_at, lab_name,
                hemoglobin, hematocrit, white_blood_cells, platelets,
                glucose_fasting, hba1c, total_cholesterol, hdl_cholesterol,
                ldl_cholesterol, triglycerides, creatinine, pt_inr, aptt,
                custom_values,
                canonical_status_id, confirmation_status_id, certification_status_id,
                provenance_id, member_confirmed, member_confirmed_at,
                requires_member_confirmation)
             VALUES (
               $1, COALESCE($2::date, CURRENT_DATE), core.encrypt_pii($3),
               $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
               $17::jsonb,
               params.catalog_id('CANONICAL_STATUS', 'PROVISIONAL'),
               params.catalog_id('CONFIRMATION_STATUS', 'MEMBER_CONFIRMED'),
               params.catalog_id('CERTIFICATION_STATUS', 'UNCERTIFIED'),
               params.catalog_id('PROVENANCE_TYPE', 'AI_ASSISTED'),
               TRUE, NOW(), FALSE
             )
             RETURNING id`,
            [
              personId,
              performedAt,
              labName,
              data.hemoglobin ?? null,
              data.hematocrit ?? null,
              data.whiteBloodCells ?? null,
              data.platelets ?? null,
              data.glucoseFasting ?? null,
              data.hba1c ?? null,
              data.totalCholesterol ?? null,
              data.hdlCholesterol ?? null,
              data.ldlCholesterol ?? null,
              data.triglycerides ?? null,
              data.creatinine ?? null,
              data.ptInr ?? null,
              data.aptt ?? null,
              JSON.stringify(customValues),
            ],
          );
          resultingId = row.id;
          resultingTable = 'clinical.lab_results';
        }
      }

    await queryRunner.query(
      `UPDATE ai.proposals
       SET status = 'CONFIRMED', confirmed_at = NOW(),
           resulting_record_id = $2, resulting_record_table = $3
       WHERE id = $1`,
      [proposal.id, resultingId, resultingTable],
    );

    return { proposalId: proposal.id, resultingId, resultingTable };
  }

  async rejectProposal(personId: string, proposalId: string) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const result = await queryRunner.query(
        `UPDATE ai.proposals
         SET status = 'REJECTED', rejected_at = NOW()
         WHERE id = $1 AND person_id = $2 AND status = 'PENDING_CONFIRMATION'
         RETURNING id`,
        [proposalId, personId],
      );
      if (result.length === 0) {
        throw new BadRequestException('Propuesta no encontrada o ya procesada');
      }
      return { id: proposalId };
    });
  }

  /**
   * Pedido explícito del usuario: "si quedan cosas pendientes de
   * confirmación, debería salir un popup que muestre lo que está
   * pendiente y pueda confirmar o descartar esa información" — al
   * salir de la charla (botón atrás), la app consulta esto antes de
   * cerrar la pantalla para no dejar datos sueltos en limbo.
   */
  async getPendingProposals(personId: string, conversationId: string) {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT id, proposal_type, json_data, created_at
         FROM ai.proposals
         WHERE conversation_id = $1 AND person_id = $2 AND status = 'PENDING_CONFIRMATION'
         ORDER BY created_at ASC`,
        [conversationId, personId],
      ),
    ).then((rows: { id: string; proposal_type: string; json_data: Record<string, unknown>; created_at: Date }[]) =>
      rows.map((row) => ({
        id: row.id,
        proposalType: row.proposal_type,
        label: this.formatPendingProposalLabel(row.proposal_type, row.json_data),
      })),
    );
  }

  private formatPendingProposalLabel(proposalType: string, data: Record<string, unknown>): string {
    switch (proposalType) {
      case 'VITALS': {
        const bits: string[] = [];
        if (data.birthDateRaw || data.birthDate) bits.push(`fecha de nacimiento ${data.birthDateRaw ?? data.birthDate}`);
        if (data.genderCode) bits.push(`sexo ${data.genderCode}`);
        if (data.weightKg != null) bits.push(`peso ${data.weightKg}kg`);
        if (data.heightCm != null) bits.push(`altura ${data.heightCm}cm`);
        if (data.bloodTypeCode) bits.push(`grupo sanguíneo ${data.bloodTypeCode}`);
        return `Datos básicos: ${bits.join(', ')}`;
      }
      case 'CONDITION': return `Enfermedad: ${data.conditionName}`;
      case 'ALLERGY': return `Alergia: ${data.allergenName}`;
      case 'MEDICATION': return `Medicamento: ${data.genericName}`;
      case 'SURGERY': return `Cirugía: ${data.procedureName}`;
      case 'IMPLANT_DEVICE': return `Implante: ${data.deviceName}`;
      case 'LAB_RESULT': {
        // Pedido explícito del usuario: "me dice Análisis de sangre sin
        // darme detalle de los valores. No dice Glucemia y el valor" —
        // el popup tiene que mostrar los valores concretos, no solo el
        // nombre del estudio, para que se entienda qué es lo que se
        // está por perder si se descarta.
        const date = data.performedDate ?? data.performedDateRaw ?? '';
        const labFieldLabels: [string, string][] = [
          ['hemoglobin', 'Hemoglobina'], ['hematocrit', 'Hematocrito'],
          ['whiteBloodCells', 'Glóbulos blancos'], ['platelets', 'Plaquetas'],
          ['glucoseFasting', 'Glucemia en ayunas'], ['hba1c', 'HbA1c'],
          ['totalCholesterol', 'Colesterol total'], ['hdlCholesterol', 'Colesterol HDL'],
          ['ldlCholesterol', 'Colesterol LDL'], ['triglycerides', 'Triglicéridos'],
          ['creatinine', 'Creatinina'], ['ptInr', 'PT-INR'], ['aptt', 'APTT'],
        ];
        const values = labFieldLabels
          .filter(([key]) => data[key] != null)
          .map(([key, label]) => `${label} ${data[key]}`);
        const customValues = (data.customValues as { name: string; value: string }[] | null) ?? [];
        for (const cv of customValues) values.push(`${cv.name} ${cv.value}`);
        return `Análisis: ${data.labName ?? 'estudio'}${date ? ` (${date})` : ''}` +
          (values.length ? ` — ${values.join(', ')}` : '');
      }
      default: return String(proposalType);
    }
  }

  /**
   * Descarta TODO lo pendiente de una conversación de una — usado
   * cuando el viajero elige "Descartar" en el popup de salida en vez
   * de confirmar o cancelar.
   */
  async rejectAllPendingProposals(personId: string, conversationId: string) {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `UPDATE ai.proposals
         SET status = 'REJECTED', rejected_at = NOW()
         WHERE conversation_id = $1 AND person_id = $2 AND status = 'PENDING_CONFIRMATION'
         RETURNING id`,
        [conversationId, personId],
      ),
    );
  }

  /**
   * Edad + sexo para que el asistente priorice qué preguntar primero
   * (ej. un varón de 65 años arranca por antecedentes cardiovasculares,
   * no hace falta preguntarle por anticoncepción) — nunca se le muestra
   * al viajero como pregunta, es contexto interno del prompt.
   */
  /**
   * gap #62: el asistente solo sabía edad/sexo — no tenía forma de
   * saber qué antecedentes YA estaban cargados (ni de una conversación
   * previa con el asistente, ni cargados a mano desde "Ficha médica"),
   * así que volvía a proponer lo mismo una y otra vez, chocando con el
   * trigger anti-duplicados (gap #46) sin que el usuario entendiera
   * por qué "no se podía confirmar". Se agrega acá la lista de lo ya
   * confirmado, para que el prompt (ver SYSTEM_PROMPT) sepa no
   * repreguntarlo ni re-proponerlo.
   */
  private async getPersonContext(
    queryRunner: QueryRunner,
    personId: string,
  ): Promise<string | undefined> {
    const [row] = await queryRunner.query(
      `SELECT
         core.decrypt_pii(p.first_name) AS first_name,
         EXTRACT(YEAR FROM age(p.birth_date))::int AS age,
         g.code AS gender_code,
         p.health_record_last_updated_at
       FROM core.persons p
       LEFT JOIN params.catalog_values g ON g.id = p.gender_id
       WHERE p.id = $1`,
      [personId],
    );

    const parts: string[] = [];
    if (row?.first_name) parts.push(`nombre: ${row.first_name}`);
    if (row?.age != null) {
      parts.push(`${row.age} años (fecha de nacimiento ya cargada)`);
    } else {
      parts.push('fecha de nacimiento no cargada todavía');
    }
    if (row?.gender_code) {
      parts.push(row.gender_code === 'MALE' ? 'sexo masculino' : row.gender_code === 'FEMALE' ? 'sexo femenino' : row.gender_code);
    }

    let hasClinicalData = false;

    /**
     * clinical.vitals_history es append-only (vitals_no_update USING FALSE)
     * — cada carga desde la app crea una fila nueva solo con los campos
     * completados esa vez (ej. peso/altura en una carga, grupo sanguíneo
     * en otra posterior). Tomar la fila más reciente entera hacía que el
     * asistente "olvidara" un dato ya cargado apenas se guardaba otro
     * campo distinto después, y volviera a preguntarlo — hay que resolver
     * el valor no-nulo más reciente POR CAMPO, no por fila.
     */
    const [latestVitals] = await queryRunner.query(
      `SELECT
         (SELECT weight_kg FROM clinical.vitals_history
          WHERE person_id = $1 AND deleted_at IS NULL AND weight_kg IS NOT NULL
          ORDER BY measured_at DESC LIMIT 1) AS weight_kg,
         (SELECT height_cm FROM clinical.vitals_history
          WHERE person_id = $1 AND deleted_at IS NULL AND height_cm IS NOT NULL
          ORDER BY measured_at DESC LIMIT 1) AS height_cm,
         (SELECT bt.code FROM clinical.vitals_history v
          JOIN params.catalog_values bt ON bt.id = v.blood_type_id
          WHERE v.person_id = $1 AND v.deleted_at IS NULL AND v.blood_type_id IS NOT NULL
          ORDER BY v.measured_at DESC LIMIT 1) AS blood_type_code`,
      [personId],
    );
    if (latestVitals?.weight_kg != null) {
      parts.push(`peso ya cargado: ${latestVitals.weight_kg} kg`);
      hasClinicalData = true;
    }
    if (latestVitals?.height_cm != null) {
      parts.push(`altura ya cargada: ${latestVitals.height_cm} cm`);
      hasClinicalData = true;
    }
    if (latestVitals?.blood_type_code) {
      parts.push(`grupo sanguíneo ya cargado: ${latestVitals.blood_type_code}`);
      hasClinicalData = true;
    }

    const [conditions, allergies, medications, surgeries, labResults] = await Promise.all([
      queryRunner.query(
        `SELECT core.decrypt_pii(condition_name) AS name FROM clinical.conditions
         WHERE person_id = $1 AND active = TRUE AND deleted_at IS NULL`,
        [personId],
      ),
      queryRunner.query(
        `SELECT core.decrypt_pii(allergen_name) AS name FROM clinical.allergies
         WHERE person_id = $1 AND active = TRUE AND deleted_at IS NULL`,
        [personId],
      ),
      queryRunner.query(
        `SELECT core.decrypt_pii(generic_name) AS name FROM clinical.medications
         WHERE person_id = $1 AND active = TRUE AND is_current = TRUE AND deleted_at IS NULL`,
        [personId],
      ),
      queryRunner.query(
        `SELECT core.decrypt_pii(procedure_name) AS name FROM clinical.surgeries
         WHERE person_id = $1 AND deleted_at IS NULL`,
        [personId],
      ),
      // Bug real reportado en vivo: "le consulté qué análisis tengo
      // registrado... y me dijo que no tengo ningún estudio cargado,
      // cuando es falso". getPersonContext nunca había consultado
      // clinical.lab_results — el dato se guardaba bien, pero la IA
      // jamás lo veía en el contexto, así que no tenía forma de saber
      // que existía.
      queryRunner.query(
        `SELECT performed_at, core.decrypt_pii(lab_name) AS lab_name,
                hemoglobin, hematocrit, white_blood_cells, platelets, neutrophils_pct, lymphocytes_pct,
                glucose_fasting, glucose_postprand, hba1c,
                total_cholesterol, hdl_cholesterol, ldl_cholesterol, triglycerides,
                creatinine, bun, uric_acid, egfr,
                alt, ast, ggt, total_bilirubin, albumin,
                tsh, t3_free, t4_free,
                pt_inr, aptt,
                sodium, potassium, calcium,
                crp, ferritin,
                vitamin_d, vitamin_b12,
                custom_values
         FROM clinical.lab_results
         WHERE person_id = $1 AND deleted_at IS NULL
         ORDER BY performed_at DESC`,
        [personId],
      ),
    ]);

    if (conditions.length) {
      parts.push(`antecedentes ya cargados: ${conditions.map((c: { name: string }) => c.name).join(', ')}`);
      hasClinicalData = true;
    }
    if (allergies.length) {
      parts.push(`alergias ya cargadas: ${allergies.map((a: { name: string }) => a.name).join(', ')}`);
      hasClinicalData = true;
    }
    if (medications.length) {
      parts.push(`medicamentos ya cargados: ${medications.map((m: { name: string }) => m.name).join(', ')}`);
      hasClinicalData = true;
    }
    if (surgeries.length) {
      parts.push(`cirugías ya cargadas: ${surgeries.map((s: { name: string }) => s.name).join(', ')}`);
      hasClinicalData = true;
    }
    if (labResults.length) {
      const labFieldLabels: [string, string][] = [
        ['hemoglobin', 'Hemoglobina'], ['hematocrit', 'Hematocrito'],
        ['white_blood_cells', 'Glóbulos blancos'], ['platelets', 'Plaquetas'],
        ['neutrophils_pct', 'Neutrófilos %'], ['lymphocytes_pct', 'Linfocitos %'],
        ['glucose_fasting', 'Glucemia en ayunas'], ['glucose_postprand', 'Glucemia postprandial'], ['hba1c', 'HbA1c'],
        ['total_cholesterol', 'Colesterol total'], ['hdl_cholesterol', 'Colesterol HDL'],
        ['ldl_cholesterol', 'Colesterol LDL'], ['triglycerides', 'Triglicéridos'],
        ['creatinine', 'Creatinina'], ['bun', 'Urea (BUN)'], ['uric_acid', 'Ácido úrico'], ['egfr', 'Filtrado glomerular (eGFR)'],
        ['alt', 'ALT (TGP)'], ['ast', 'AST (TGO)'], ['ggt', 'GGT'], ['total_bilirubin', 'Bilirrubina total'], ['albumin', 'Albúmina'],
        ['tsh', 'TSH'], ['t3_free', 'T3 libre'], ['t4_free', 'T4 libre'],
        ['pt_inr', 'PT-INR'], ['aptt', 'APTT'],
        ['sodium', 'Sodio'], ['potassium', 'Potasio'], ['calcium', 'Calcio'],
        ['crp', 'PCR'], ['ferritin', 'Ferritina'],
        ['vitamin_d', 'Vitamina D'], ['vitamin_b12', 'Vitamina B12'],
      ];
      const labSummaries = labResults.map((r: Record<string, unknown>) => {
        const values = labFieldLabels
          .filter(([key]) => r[key] != null)
          .map(([key, label]) => `${label} ${r[key]}`);
        const customValues = (r.custom_values as { name: string; value: string }[] | null) ?? [];
        for (const cv of customValues) values.push(`${cv.name} ${cv.value}`);
        const date = r.performed_at instanceof Date ? r.performed_at.toISOString().slice(0, 10) : r.performed_at;
        const name = r.lab_name || 'Análisis';
        return `${name} (${date})${values.length ? ': ' + values.join(', ') : ''}`;
      });
      parts.push(`estudios/análisis ya cargados: ${labSummaries.join(' | ')}`);
      hasClinicalData = true;
    }

    // Flag explícito para el primer turno (ver SYSTEM_PROMPT): la IA
    // decide sola el saludo, pero necesita saber si arrancar por los
    // datos básicos o por "¿querés agregar algo nuevo?".
    parts.push(
      hasClinicalData
        ? 'YA TIENE DATOS CLÍNICOS CARGADOS'
        : 'SIN NINGÚN DATO CLÍNICO CARGADO TODAVÍA',
    );

    // Bug real reportado en vivo: el modelo Estructurado SÍ menciona la
    // fecha de la última actualización en su saludo fijo ("Ya tenés
    // datos cargados — la última actualización fue el {fecha}"), pero
    // el Clásico decía "ya tengo cargada tu ficha" sin fecha porque acá
    // nunca se le pasaba el dato — mismo criterio que el bloque de
    // RECORDATORIO ACTIVO de abajo, pero SIEMPRE que haya datos (no
    // solo cuando ya pasó el umbral de días).
    if (hasClinicalData && row?.health_record_last_updated_at) {
      const lastUpdated = new Date(row.health_record_last_updated_at).toLocaleDateString('es-AR');
      parts.push(`última actualización de la ficha: ${lastUpdated}`);
    }

    // Pedido explícito del usuario: si pasaron muchos días desde la
    // última actualización (umbral configurable en
    // health.reminder_days, mismo que usa el banner de la app móvil y
    // el saludo del modelo Estructurado), el saludo del PRIMER TURNO
    // tiene que preguntar puntualmente por novedades en vez del
    // genérico "¿querés agregar o corregir algo?" — ver SYSTEM_PROMPT.
    if (hasClinicalData && row?.health_record_last_updated_at) {
      const [reminderDaysSetting] = await queryRunner.query(
        `SELECT setting_value FROM params.app_settings WHERE setting_key = 'health.reminder_days'`,
      );
      const reminderDays = Number(reminderDaysSetting?.setting_value) || 60;
      const daysSinceUpdate = Math.floor(
        (Date.now() - new Date(row.health_record_last_updated_at).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysSinceUpdate >= reminderDays) {
        const lastUpdated = new Date(row.health_record_last_updated_at).toLocaleDateString('es-AR');
        parts.push(
          `RECORDATORIO ACTIVO: pasaron ${daysSinceUpdate} días desde la última actualización ` +
          `(${lastUpdated}), más que el umbral de ${reminderDays} — en el saludo del primer turno, ` +
          `preguntá explícitamente si tiene alguna novedad de salud para contar, en vez de la pregunta genérica`,
        );
      }
    }

    return parts.length ? parts.join('; ') : undefined;
  }

  /**
   * Bug real reportado en vivo: el modelo solo recibe el TEXTO de sus
   * propias respuestas anteriores (ver loadHistory) — el JSON de
   * "proposals" que generó nunca vuelve a mandarse en turnos
   * siguientes, así que no tenía forma confiable de saber qué datos ya
   * había anotado como pendientes EN ESTA MISMA CHARLA. Resultado:
   * volvía a proponer peso/altura turno tras turno (vitals_history no
   * tiene trigger anti-duplicados, es histórico a propósito, así que
   * cada repetición generaba una fila nueva de verdad) y re-proponía
   * comorbilidades ya anotadas, chocando después contra el trigger
   * anti-duplicados al confirmar todo junto — con el perfil recién
   * empezado, sin nada cargado antes. Mismo patrón que
   * getPersonContext ("ya cargado" para lo YA CONFIRMADO de otras
   * charlas), pero acá para lo pendiente de ESTA conversación.
   */
  private async getConversationPendingContext(
    queryRunner: QueryRunner,
    conversationId: string,
  ): Promise<string | undefined> {
    const pending = await queryRunner.query(
      `SELECT proposal_type, json_data
       FROM ai.proposals
       WHERE conversation_id = $1 AND status = 'PENDING_CONFIRMATION'
       ORDER BY created_at ASC`,
      [conversationId],
    );
    if (pending.length === 0) return undefined;

    const parts: string[] = [];
    for (const row of pending) {
      const data = row.json_data as Record<string, unknown>;
      switch (row.proposal_type) {
        case 'VITALS': {
          const bits: string[] = [];
          if (data.birthDateRaw || data.birthDate) bits.push(`fecha de nacimiento ${data.birthDateRaw ?? data.birthDate}`);
          if (data.genderCode) bits.push(`sexo ${data.genderCode}`);
          if (data.weightKg != null) bits.push(`peso ${data.weightKg}kg`);
          if (data.heightCm != null) bits.push(`altura ${data.heightCm}cm`);
          if (data.bloodPressureSystolic != null && data.bloodPressureDiastolic != null) {
            bits.push(`presión arterial ${data.bloodPressureSystolic}/${data.bloodPressureDiastolic}`);
          }
          if (data.bloodTypeCode) bits.push(`grupo sanguíneo ${data.bloodTypeCode}`);
          if (bits.length) parts.push(`datos básicos ya anotados en esta charla: ${bits.join(', ')}`);
          break;
        }
        case 'CONDITION':
          parts.push(`condición ya anotada en esta charla: ${data.conditionName}`);
          break;
        case 'ALLERGY':
          parts.push(`alergia ya anotada en esta charla: ${data.allergenName}`);
          break;
        case 'MEDICATION':
          parts.push(`medicamento ya anotado en esta charla: ${data.genericName}`);
          break;
        case 'SURGERY':
          parts.push(`cirugía ya anotada en esta charla: ${data.procedureName}`);
          break;
        case 'IMPLANT_DEVICE':
          parts.push(`implante ya anotado en esta charla: ${data.deviceName}`);
          break;
        case 'LAB_RESULT':
          parts.push(`estudio ya anotado en esta charla${data.labName ? `: ${data.labName}` : ''}`);
          break;
      }
    }
    return parts.length ? `${parts.join('; ')}. NO vuelvas a proponer estos mismos datos salvo que el viajero los esté corrigiendo o ampliando` : undefined;
  }

  /**
   * Pedido explícito del usuario: "Como hicimos con Base de conocimiento
   * IA podemos armar algo similar para... la carga de antecedentes de
   * la ficha de salud" — mismo mecanismo de gap #72
   * (ai.knowledge_base_entries), pero con scope HEALTH_ASSISTANT/BOTH
   * (gap #73). Se le agrega al SYSTEM_PROMPT de openai.provider.ts en
   * vez de reemplazarlo: las reglas de seguridad y el contrato JSON de
   * proposals quedan fijos en código, lo editable desde admin-web es
   * el estilo de presentación / qué priorizar preguntar / cómo pedir
   * actualizaciones.
   */
  private async getHealthAssistantScriptGuidance(
    queryRunner: QueryRunner,
  ): Promise<string | undefined> {
    return this.getScriptGuidance(queryRunner, 'HEALTH_ASSISTANT');
  }

  /** Mismo mecanismo, para el asistente de ayuda de uso de la app (`/me/assistant/ask`). */
  private async getAppHelpScriptGuidance(
    queryRunner: QueryRunner,
  ): Promise<string | undefined> {
    return this.getScriptGuidance(queryRunner, 'APP_HELP_ASSISTANT');
  }

  private async getScriptGuidance(
    queryRunner: QueryRunner,
    scopeCode: string,
  ): Promise<string | undefined> {
    const entries = await queryRunner.query(
      `SELECT k.title, k.content
       FROM ai.knowledge_base_entries k
       JOIN ai.knowledge_base_entry_scopes s ON s.entry_id = k.id
       JOIN params.catalog_values cv ON cv.id = s.scope_id
       WHERE k.active = TRUE AND cv.code = $1
       ORDER BY k.created_at`,
      [scopeCode],
    );
    if (!entries.length) return undefined;
    return entries
      .map((e: { title: string; content: string }) => `${e.title}: ${e.content}`)
      .join(' | ');
  }

  /**
   * Ayuda de uso de la app (`/me/assistant/ask`) — movido acá desde
   * MeAssistantController (que llamaba al SDK de OpenAI directo,
   * violando MTA-103 §10) para poder alimentarlo de la base de
   * conocimiento igual que los otros dos asistentes (gap #73).
   */
  async appHelpChat(question: string): Promise<{ answer: string; configured: boolean }> {
    if (!this.config.get<boolean>('AI_ENABLED')) {
      return { answer: FALLBACK_ANSWER_APP_HELP, configured: false };
    }
    return this.txManager.runInTransaction(async (queryRunner) => {
      const guidance = await this.getAppHelpScriptGuidance(queryRunner);
      const result = await this.provider.appHelpChat(question, guidance);
      return { answer: result.answer || FALLBACK_ANSWER_APP_HELP, configured: true };
    });
  }

  /**
   * Mensaje de bienvenida general al primer uso de la app — pedido
   * explícito del usuario: mismo mecanismo de base de conocimiento que
   * los otros 3 asistentes (gap #73), scope ONBOARDING, para que el
   * guion viva en `ai.knowledge_base_entries` editable desde admin-web
   * y no hardcodeado en el cliente. A diferencia de los otros
   * asistentes, no hace falta un llamado a OpenAI para esto — es texto
   * fijo que el operador redacta una vez, se muestra tal cual (sin
   * pasar por un modelo que podría reformularlo distinto cada vez).
   * Si no hay ninguna entrada activa, se usa el fallback en código.
   */
  async getOnboardingMessage(): Promise<{ message: string; configured: boolean }> {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const entries = await queryRunner.query(
        `SELECT k.content
         FROM ai.knowledge_base_entries k
         JOIN ai.knowledge_base_entry_scopes s ON s.entry_id = k.id
         JOIN params.catalog_values cv ON cv.id = s.scope_id
         WHERE k.active = TRUE AND cv.code = 'ONBOARDING'
         ORDER BY k.created_at
         LIMIT 1`,
      );
      const content = entries[0]?.content as string | undefined;
      return {
        message: content?.trim() || FALLBACK_ONBOARDING_MESSAGE,
        configured: !!content,
      };
    });
  }

  private async startConversation(
    queryRunner: QueryRunner,
    personId: string,
  ): Promise<string> {
    const [row] = await queryRunner.query(
      `INSERT INTO ai.conversations (person_id, conversation_type)
       VALUES ($1, 'HEALTH_DATA_CAPTURE')
       RETURNING id`,
      [personId],
    );
    return row.id;
  }

  private async loadHistory(
    queryRunner: QueryRunner,
    conversationId: string,
  ): Promise<AIChatMessage[]> {
    const rows = await queryRunner.query(
      `SELECT sender, core.decrypt_pii(message) AS message
       FROM ai.messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC`,
      [conversationId],
    );
    return rows.map((r: { sender: string; message: string }) => ({
      role: r.sender === 'USER' ? 'user' : 'assistant',
      content: r.message,
    }));
  }

  private async insertMessage(
    queryRunner: QueryRunner,
    params: {
      conversationId: string;
      personId: string;
      sender: 'USER' | 'ASSISTANT';
      message: string;
      provider: string;
      model: string | null;
      tokensInput?: number;
      tokensOutput?: number;
      estimatedCostUsd?: number;
      processingMs?: number;
    },
  ) {
    return queryRunner.query(
      `INSERT INTO ai.messages
         (conversation_id, person_id, sender, message, provider, model,
          tokens_input, tokens_output, estimated_cost_usd, processing_ms)
       VALUES ($1, $2, $3, core.encrypt_pii($4), $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        params.conversationId,
        params.personId,
        params.sender,
        params.message,
        params.provider,
        params.model,
        params.tokensInput ?? null,
        params.tokensOutput ?? null,
        params.estimatedCostUsd ?? null,
        params.processingMs ?? null,
      ],
    );
  }

  private async insertProposals(
    queryRunner: QueryRunner,
    conversationId: string,
    messageId: string,
    personId: string,
    proposals: AIProposalCandidate[],
    provider: string,
    model: string,
  ) {
    const rows: Array<{
      id: string;
      proposalType: string;
      confidence: number;
      data: Record<string, unknown>;
    }> = [];
    for (const proposal of proposals) {
      const [row] = await queryRunner.query(
        `INSERT INTO ai.proposals
           (conversation_id, message_id, person_id, proposal_type, confidence, json_data, provider, model)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
         RETURNING id`,
        [
          conversationId,
          messageId,
          personId,
          proposal.proposalType,
          proposal.confidence,
          JSON.stringify(proposal.data),
          provider,
          model,
        ],
      );
      rows.push({
        id: row.id,
        proposalType: proposal.proposalType,
        confidence: proposal.confidence,
        data: proposal.data as unknown as Record<string, unknown>,
      });
    }
    return rows;
  }

  private async checkLimits(
    queryRunner: QueryRunner,
    personId: string,
  ): Promise<HealthChatOutcome['limitReached']> {
    const maxPerUserDay =
      this.config.get<number>('AI_MAX_REQUESTS_PER_USER_DAY') ?? 10;
    const [{ count }] = await queryRunner.query(
      `SELECT COUNT(*)::int AS count
       FROM ai.messages
       WHERE person_id = $1 AND sender = 'USER' AND created_at >= date_trunc('day', now())`,
      [personId],
    );
    if (count >= maxPerUserDay) {
      return 'USER_DAILY';
    }

    const [{ cost_today, cost_this_month }] = await queryRunner.query(
      `SELECT * FROM ai.get_consumption_totals()`,
    );
    const dailyBudget = this.config.get<number>('AI_DAILY_BUDGET_USD') ?? 1;
    const monthlyBudget =
      this.config.get<number>('AI_MONTHLY_BUDGET_USD') ?? 10;
    if (Number(cost_today) >= dailyBudget) {
      return 'PLATFORM_DAILY_BUDGET';
    }
    if (Number(cost_this_month) >= monthlyBudget) {
      return 'PLATFORM_MONTHLY_BUDGET';
    }
    return undefined;
  }
}
