import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import Anthropic from '@anthropic-ai/sdk';

import { AskAssistantDto } from './dto/ask-assistant.dto';

const SYSTEM_PROMPT = `Sos el asistente de ayuda dentro de la app MedTravelApp, para viajeros.
Tu único trabajo es ayudar a la persona a USAR LA APP: completar su ficha médica
(alergias, condiciones, medicamentos), entender su cobertura de asistencia al
viajero, cargar su documento para que el sistema la asocie a su póliza, y
compartir su historia clínica con un médico vía QR/link cuando necesite atención.
Respondé siempre en español, en 2-4 oraciones, tono claro y tranquilizador.
NUNCA das diagnósticos médicos, indicaciones de tratamiento, ni interpretás
síntomas — para eso está la sección de "Compartir con el médico" de la app.
Si te preguntan algo médico, redirigí amablemente a consultar un profesional
o a usar la emergencia de la app.`;

const FALLBACK_ANSWER =
  'El asistente de IA todavía no está configurado en este ambiente. ' +
  'Mientras tanto: completá tu ficha médica desde "Salud" (alergias, condiciones ' +
  'y medicamentos son los datos más importantes ante una urgencia), cargá tu ' +
  'documento en "Perfil" para que el sistema te asocie a tu póliza automáticamente, ' +
  'y usá "Compartir" para generar un QR que el médico que te atienda pueda leer sin necesitar cuenta.';

/**
 * Ayuda contextual para usar la app — pedido explícito del usuario
 * ("ayuda de IA para su uso"), no un chat clínico. Si no hay
 * ANTHROPIC_API_KEY configurada (ver env.validation.ts, opcional a
 * propósito), responde con la ayuda estática de arriba en vez de
 * fallar — la pantalla sigue siendo útil sin la clave.
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/assistant')
export class MeAssistantController {
  constructor(private readonly config: ConfigService) {}

  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @Post('ask')
  async ask(@Body() dto: AskAssistantDto) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return { answer: FALLBACK_ANSWER, configured: false };
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: dto.question }],
    });

    const answer = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return { answer, configured: true };
  }
}
