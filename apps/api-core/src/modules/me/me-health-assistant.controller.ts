import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';
import { AIService } from '@modules/ai/ai.service';

import { HealthChatDto, ProposalActionParamsDto } from './dto/health-chat.dto';

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
        proposals: [],
      };
    }
    return outcome;
  }

  @Post('proposals/:id/confirm')
  async confirmProposal(
    @CurrentContext() context: RequestContextData,
    @Param() params: ProposalActionParamsDto,
  ) {
    return this.aiService.confirmProposal(context.personId!, params.id);
  }

  @Post('proposals/:id/reject')
  async rejectProposal(
    @CurrentContext() context: RequestContextData,
    @Param() params: ProposalActionParamsDto,
  ) {
    return this.aiService.rejectProposal(context.personId!, params.id);
  }
}
