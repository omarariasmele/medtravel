import { Readable } from 'stream';

import { Body, Controller, Get, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';
import { AIService } from '@modules/ai/ai.service';

import { HealthChatDto, ProposalActionParamsDto } from './dto/health-chat.dto';
import { HealthFormSubmitDto, UpdateConditionAnswerDto } from './dto/health-form.dto';
import { RealtimeEditRecordDto } from './dto/realtime-edit-record.dto';
import { RealtimeProposalDto } from './dto/realtime-proposal.dto';
import { RealtimeUsageDto } from './dto/realtime-usage.dto';
import { RealtimeUserMessageDto } from './dto/realtime-user-message.dto';
import { SynthesizeSpeechDto } from './dto/synthesize-speech.dto';

// Pedido explícito del usuario: cuando la IA no está disponible (por
// cualquiera de estos límites), recordarle al viajero que no la
// necesita para mantener su Historial de Salud — el modo Formulario
// (una sola pantalla, sin chat, mismo selector de "Salud" donde están
// Clásico/Estructurado/Formulario) hace exactamente lo mismo sin
// costo de IA.
const NO_AI_NEEDED_HINT =
  'No hace falta el asistente de IA para mantener tu Historial de Salud — entrá a "Salud" y usá el modo Formulario para cargar o corregir tus datos directamente.';

const LIMIT_MESSAGES: Record<string, string> = {
  USER_DAILY:
    `Llegaste al máximo de mensajes de hoy para el asistente de salud. Probá de nuevo mañana. ${NO_AI_NEEDED_HINT}`,
  PLATFORM_DAILY_BUDGET:
    `El asistente de salud alcanzó su límite de uso de hoy en toda la plataforma. Probá de nuevo mañana. ${NO_AI_NEEDED_HINT}`,
  PLATFORM_MONTHLY_BUDGET:
    `El asistente de salud alcanzó su límite de uso de este mes en toda la plataforma. ${NO_AI_NEEDED_HINT}`,
  USER_FREE_LIMIT:
    `Llegaste a tu límite de uso gratuito del asistente de IA — pronto vamos a sumar planes para ampliar el uso. ${NO_AI_NEEDED_HINT}`,
};

/**
 * Chat de IA para cargar ficha médica (alergias/medicamentos) —
 * distinto de MeAssistantController (ese es ayuda genérica de uso de
 * la app). Acá la IA propone datos estructurados (ai.proposals) que
 * SOLO se vuelven registros clínicos reales cuando el viajero confirma
 * explícitamente (POST .../confirm) — nunca antes (MTA-103 §6).
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/health-assistant')
export class MeHealthAssistantController {
  constructor(private readonly aiService: AIService) {}

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('chat')
  async chat(
    @CurrentContext() context: RequestContextData,
    @Body() dto: HealthChatDto,
  ) {
    const outcome = await this.aiService.healthChat(
      context.personId!,
      dto.conversationId,
      dto.question,
    );
    if (outcome.limitReached) {
      return {
        conversationId: outcome.conversationId,
        reply: LIMIT_MESSAGES[outcome.limitReached],
        configured: true,
        interviewComplete: false,
        proposals: [],
      };
    }
    return outcome;
  }

  /**
   * Motor nuevo del modo Clásico — voz en tiempo real (OpenAI Realtime
   * API vía WebRTC), pedido explícito del usuario para reemplazar el
   * motor de texto actual (speech_to_text + chat + TTS separados) por
   * uno sin las costuras que venían dando bugs (cuelgues de
   * reconocimiento, ventana de silencio corta, correcciones perdidas).
   * Devuelve un token efímero de corta duración — el celular lo usa
   * para conectarse DIRECTO a OpenAI, nuestra API key real nunca sale
   * del servidor. Throttle bajo: se llama una sola vez por charla, al
   * entrar a la pantalla.
   */
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('realtime-session')
  async createRealtimeSession(@CurrentContext() context: RequestContextData) {
    return this.aiService.createRealtimeSession(context.personId!);
  }

  /**
   * Pedido explícito del usuario: mismo motor de voz continua de
   * arriba, pero para el modo Estructurado — arma un guion fijo con
   * las preguntas de ai.interview_questions que todavía falten (ver
   * AIService.createStructuredRealtimeSession) en vez de la charla
   * libre de Clásico. Reusa el resto del pipeline (realtime-proposals,
   * confirm-all) sin cambios.
   */
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('realtime-session-structured')
  async createStructuredRealtimeSession(@CurrentContext() context: RequestContextData) {
    return this.aiService.createStructuredRealtimeSession(context.personId!);
  }

  /**
   * El celular postea acá cada vez que la tool save_health_proposal se
   * dispara durante una charla del motor Realtime — ver
   * createRealtimeSession arriba. Guarda como PENDING_CONFIRMATION,
   * mismo criterio que los otros tres modelos.
   */
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post('realtime-proposals')
  async saveRealtimeProposal(
    @CurrentContext() context: RequestContextData,
    @Body() dto: RealtimeProposalDto,
  ) {
    return this.aiService.saveRealtimeProposal(context.personId!, dto.conversationId, {
      proposalType: dto.proposalType,
      confidence: dto.confidence,
      data: dto.data as never,
    });
  }

  /**
   * Pedido explícito del usuario: "tenemos que darle al modelo clásico
   * la posibilidad de que el usuario modifique sus antecedentes
   * hablando con la IA" — corregir o eliminar por voz un antecedente
   * YA CONFIRMADO (de esta charla o de una anterior). Ver
   * AIService.editOrDeleteHealthRecordByVoice.
   */
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('realtime-edit-record')
  async editOrDeleteHealthRecordByVoice(
    @CurrentContext() context: RequestContextData,
    @Body() dto: RealtimeEditRecordDto,
  ) {
    return this.aiService.editOrDeleteHealthRecordByVoice(context.personId!, dto.conversationId, {
      recordType: dto.recordType,
      matchName: dto.matchName,
      action: dto.action,
      data: dto.data,
    });
  }

  /**
   * Bug real reportado en vivo: "el costo de hoy sale en cero" — el
   * motor Realtime nunca registraba tokens/costo en ai.messages. El
   * celular postea acá cada vez que llega un evento response.done con
   * datos de uso (ver RealtimeVoiceEngine._handleUsage).
   */
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Post('realtime-usage')
  async recordRealtimeUsage(
    @CurrentContext() context: RequestContextData,
    @Body() dto: RealtimeUsageDto,
  ) {
    return this.aiService.recordRealtimeUsage(context.personId!, dto.conversationId, {
      textInputTokens: dto.textInputTokens,
      audioInputTokens: dto.audioInputTokens,
      cachedInputTokens: dto.cachedInputTokens,
      textOutputTokens: dto.textOutputTokens,
      audioOutputTokens: dto.audioOutputTokens,
      totalInputTokens: dto.totalInputTokens,
      totalOutputTokens: dto.totalOutputTokens,
    });
  }

  /**
   * Bug real reportado en vivo: "Mensajes hoy" del dashboard de
   * consumo mostraba 0 con conversaciones activas reales — lo que dice
   * el VIAJERO en el motor Realtime nunca se guardaba como mensaje del
   * lado del servidor (ver AIService.recordRealtimeUserMessage).
   */
  @Throttle({ default: { ttl: 60_000, limit: 120 } })
  @Post('realtime-user-message')
  async recordRealtimeUserMessage(
    @CurrentContext() context: RequestContextData,
    @Body() dto: RealtimeUserMessageDto,
  ) {
    return this.aiService.recordRealtimeUserMessage(context.personId!, dto.conversationId, dto.text);
  }

  /**
   * Modelo Estructurado — segundo modelo de carga de Ficha de Salud
   * (guiado por ai.interview_questions, editable desde admin-web),
   * pedido explícito del usuario para compararlo con el modelo Clásico
   * de arriba en una demo (UX y costo real de IA). Reutiliza el mismo
   * `HealthChatDto` (question = lo que contestó el viajero en este
   * turno) y el mismo `POST .../conversations/:id/confirm-all` de
   * arriba para el cierre — ambos modelos comparten el mismo pipeline
   * de confirmación/guardado.
   */
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('structured-chat')
  async structuredChat(
    @CurrentContext() context: RequestContextData,
    @Body() dto: HealthChatDto,
  ) {
    const outcome = await this.aiService.structuredIntakeChat(
      context.personId!,
      dto.conversationId,
      dto.question,
    );
    if (outcome.limitReached) {
      return {
        conversationId: outcome.conversationId,
        reply: LIMIT_MESSAGES[outcome.limitReached],
        interviewComplete: false,
        options: null,
        pauseRequested: false,
      };
    }
    return outcome;
  }

  /**
   * Pedido explícito del usuario: "nada en el sistema debería ser fijo
   * sino todo depender de tablas dinámicas" — el modelo Formulario lee
   * las preguntas/opciones (antecedentes, tipos de diabetes, etc.) de
   * acá en vez de tenerlas hardcodeadas en la app. Solo lectura, sin
   * ConfigAccessGuard (a diferencia de /ai/admin/interview-questions):
   * cualquier viajero autenticado puede leerlas, ninguno puede editarlas.
   */
  @Get('interview-questions')
  async listInterviewQuestions() {
    return this.aiService.listActiveInterviewQuestions();
  }

  /**
   * Pedido explícito del usuario: TERCERA forma de cargar la Ficha de
   * Salud — un formulario de una sola pantalla (sin turnos, sin chat)
   * que se manda completo de una vez. Reusa el mismo pipeline de
   * confirmación que los otros dos modelos: esto solo inserta los
   * proposals como PENDING_CONFIRMATION, el guardado real pasa por
   * POST .../conversations/:id/confirm-all (mismo endpoint de arriba).
   */
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('form-intake')
  async formIntake(
    @CurrentContext() context: RequestContextData,
    @Body() dto: HealthFormSubmitDto,
  ) {
    return this.aiService.submitHealthForm(context.personId!, dto);
  }

  /**
   * Pedido explícito del usuario: corregir el tipo/fecha de una
   * condición ya cargada tiene que ser simple — cambiar el
   * desplegable y guardar, sin destildar/confirmar borrado/re-tildar.
   * Ver AIService.updateConditionAnswer.
   */
  @Patch('conditions/:id')
  async updateConditionAnswer(
    @CurrentContext() context: RequestContextData,
    @Param('id') id: string,
    @Body() dto: UpdateConditionAnswerDto,
  ) {
    return this.aiService.updateConditionAnswer(context.personId!, id, dto);
  }

  /**
   * Voz de OpenAI (gpt-4o-mini-tts) — pedido explícito del usuario de
   * que suene "totalmente natural, que no parezca un chat". Devuelve el
   * audio crudo (mp3), no JSON: la app lo reproduce directo. Límite más
   * bajo que /chat porque cada respuesta larga puede pedir varios
   * llamados (el texto máximo de la API son 4096 caracteres).
   */
  // Pedido explícito del usuario: que el diálogo de voz sea más
  // fluido — antes se esperaba el audio COMPLETO (varios segundos de
  // síntesis en OpenAI, bufferizado entero acá) antes de mandar un
  // solo byte al teléfono. Ahora se transmite tal cual llega de
  // OpenAI — el teléfono empieza a recibir datos apenas arrancan a
  // generarse, en vez de esperar el archivo entero.
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Post('speech')
  async speech(
    @Body() dto: SynthesizeSpeechDto,
    @Res() res: Response,
  ): Promise<void> {
    const stream = await this.aiService.synthesizeSpeechStream(dto.text, dto.voice ?? 'nova');
    res.set('Content-Type', 'audio/mpeg');
    // El ReadableStream del lib DOM (usado en la interfaz, portable
    // sin importar 'stream/web') y el de Node son el mismo objeto en
    // runtime — solo sus tipos generados no coinciden 1 a 1.
    const nodeStream = Readable.fromWeb(stream as never);
    nodeStream.pipe(res);
  }

  @Post('proposals/:id/confirm')
  async confirmProposal(
    @CurrentContext() context: RequestContextData,
    @Param() params: ProposalActionParamsDto,
  ) {
    return this.aiService.confirmProposal(context.personId!, params.id);
  }

  /**
   * Pedido explícito del usuario: no confirmar dato por dato durante la
   * entrevista — se recopila todo primero y se confirma junto al final,
   * en un solo request/transacción (ver AIService.confirmAllProposals).
   */
  @Post('conversations/:id/confirm-all')
  async confirmAllProposals(
    @CurrentContext() context: RequestContextData,
    @Param() params: ProposalActionParamsDto,
  ) {
    return this.aiService.confirmAllProposals(context.personId!, params.id);
  }

  @Post('proposals/:id/reject')
  async rejectProposal(
    @CurrentContext() context: RequestContextData,
    @Param() params: ProposalActionParamsDto,
  ) {
    return this.aiService.rejectProposal(context.personId!, params.id);
  }

  /**
   * Pedido explícito del usuario: "que vaya grabando información... no
   * perder lo registrado" — se consulta ANTES de arrancar una charla
   * nueva (POST 'Hola' inicial) para ofrecer retomar una conversación
   * incompleta en vez de repetir todo de cero. Ver
   * AIService.findResumableConversation.
   */
  @Get('resumable-conversation')
  async findResumableConversation(
    @CurrentContext() context: RequestContextData,
    @Query('model') model?: string,
  ) {
    const intakeModel = model === 'CLASSIC' ? 'CLASSIC' : 'STRUCTURED';
    return this.aiService.findResumableConversation(context.personId!, intakeModel);
  }

  /**
   * Pedido explícito del usuario: popup al presionar "atrás" con cosas
   * pendientes de confirmar — la app consulta esto antes de cerrar.
   */
  @Get('conversations/:id/pending')
  async listPendingProposals(
    @CurrentContext() context: RequestContextData,
    @Param() params: ProposalActionParamsDto,
  ) {
    return this.aiService.getPendingProposals(context.personId!, params.id);
  }

  @Post('conversations/:id/reject-all')
  async rejectAllProposals(
    @CurrentContext() context: RequestContextData,
    @Param() params: ProposalActionParamsDto,
  ) {
    return this.aiService.rejectAllPendingProposals(context.personId!, params.id);
  }

  /**
   * Distinto de reject-all de arriba: el motor Realtime guarda cada
   * antecedente DE UNA (ver saveRealtimeProposal), así que cuando el
   * viajero pide cerrar sin guardar nada no queda nada "pendiente" que
   * descartar — hay que deshacer lo ya aplicado. Ver
   * AIService.discardRealtimeConversation.
   */
  @Post('conversations/:id/discard-realtime')
  async discardRealtimeConversation(
    @CurrentContext() context: RequestContextData,
    @Param() params: ProposalActionParamsDto,
  ) {
    return this.aiService.discardRealtimeConversation(context.personId!, params.id);
  }
}
