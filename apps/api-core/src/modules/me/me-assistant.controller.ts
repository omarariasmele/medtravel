import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';
import { AIService } from '@modules/ai/ai.service';

import { AskAssistantDto } from './dto/ask-assistant.dto';

/**
 * Ayuda contextual para usar la app — pedido explícito del usuario
 * ("ayuda de IA para su uso"), no un chat clínico. Delega en AIService
 * (MTA-103 §10: "AI Gateway como único módulo que toca el proveedor" —
 * este controller ya no importa el SDK de OpenAI directo). Se alimenta
 * de la base de conocimiento con scope "Asistente de uso de la app"
 * (gap #73), igual que los otros dos asistentes.
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/assistant')
export class MeAssistantController {
  constructor(private readonly aiService: AIService) {}

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('ask')
  async ask(@CurrentContext() context: RequestContextData, @Body() dto: AskAssistantDto) {
    return this.aiService.appHelpChat(context.personId!, dto.question);
  }

  /** Mensaje de bienvenida general, mostrado la primera vez que se abre la app (ver home_screen.dart). */
  @Get('onboarding-message')
  async onboardingMessage() {
    return this.aiService.getOnboardingMessage();
  }
}
