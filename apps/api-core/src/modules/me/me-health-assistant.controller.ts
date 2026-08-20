import { Readable } from 'stream';

import { Body, Controller, Get, Param, Patch, Post, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';
import { AIService } from '@modules/ai/ai.service';

import { HealthChatDto, ProposalActionParamsDto } from './dto/health-chat.dto';
import { HealthFormSubmitDto, UpdateConditionAnswerDto } from './dto/health-form.dto';
import { SynthesizeSpeechDto } from './dto/synthesize-speech.dto';

const LIMIT_MESSAGES: Record<string, string> = {
  USER_DAILY:
    'Llegaste al máximo de mensajes de hoy para el asistente de salud. Probá de nuevo mañana, o cargá el dato manualmente desde "Salud".',
  PLATFORM_DAILY_BUDGET:
    'El asistente de salud alcanzó su límite de uso de hoy en toda la plataforma. Probá de nuevo mañana, o cargá el dato manualmente desde "Salud".',
  PLATFORM_MONTHLY_BUDGET:
    'El asistente de salud alcanzó su límite de uso de este mes en toda la plataforma. Cargá el dato manualmente desde "Salud" mientras tanto.',
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
    return this.aiService.structuredIntakeChat(
      context.personId!,
      dto.conversationId,
      dto.question,
    );
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
    const stream = await this.aiService.synthesizeSpeechStream(
      dto.text,
      dto.voice ?? 'nova',
    );
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
}
