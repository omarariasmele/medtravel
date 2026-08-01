import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

import {
  AIChatMessage,
  AIChatResult,
  AIProposalCandidate,
  AIProvider,
} from '../ai-provider.interface';

const SYSTEM_PROMPT = `Sos el asistente de carga de ficha médica de MedTravelApp.
Tu único trabajo es ayudar al viajero a registrar sus alergias y medicamentos
actuales charlando en español, de forma breve y clara (2-4 oraciones por turno).
Hacé una pregunta a la vez. Cuando tengas datos suficientes de UNA alergia o UN
medicamento, agregalo al array "proposals" (podés proponer varios en la misma
respuesta si el usuario los mencionó juntos). NUNCA dás diagnósticos,
indicaciones de tratamiento, ni interpretás síntomas — solo capturás los datos
que el usuario te cuenta, tal como los dice. Si falta un dato obligatorio
(allergenType, severity para alergias; genericName para medicamentos), preguntalo
antes de proponerlo. "confidence" es qué tan seguro estás de haber entendido bien
el dato (0 a 1), no una opinión médica.`;

const RESPONSE_JSON_SCHEMA = {
  name: 'health_chat_response',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      reply: { type: 'string' },
      proposals: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            proposalType: { type: 'string', enum: ['MEDICATION', 'ALLERGY'] },
            confidence: { type: 'number' },
            data: {
              type: 'object',
              additionalProperties: false,
              properties: {
                genericName: { type: ['string', 'null'] },
                brandName: { type: ['string', 'null'] },
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
                notes: { type: ['string', 'null'] },
              },
              required: [
                'genericName',
                'brandName',
                'isCurrent',
                'allergenName',
                'allergenType',
                'severity',
                'notes',
              ],
            },
          },
          required: ['proposalType', 'confidence', 'data'],
        },
      },
    },
    required: ['reply', 'proposals'],
  },
};

/**
 * Precios aproximados en USD por 1K tokens — placeholder razonable
 * hasta que se configure el pricing real del modelo contratado. Solo
 * se usa para el dashboard de consumo (estimación, no facturación).
 */
const APPROX_USD_PER_1K_INPUT_TOKENS = 0.003;
const APPROX_USD_PER_1K_OUTPUT_TOKENS = 0.015;

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

  async chat(messages: AIChatMessage[]): Promise<AIChatResult> {
    const primaryModel = this.config.get<string>('OPENAI_PRIMARY_MODEL')!;
    const fallbackModel = this.config.get<string>('OPENAI_FALLBACK_MODEL');
    const maxOutputTokens =
      this.config.get<number>('AI_MAX_OUTPUT_TOKENS') ?? 500;

    const startedAt = Date.now();
    let model = primaryModel;
    let completion;
    try {
      completion = await this.getClient().chat.completions.create({
        model: primaryModel,
        max_completion_tokens: maxOutputTokens,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
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
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        response_format: {
          type: 'json_schema',
          json_schema: RESPONSE_JSON_SCHEMA,
        },
      });
    }

    const processingMs = Date.now() - startedAt;
    const rawContent =
      completion.choices[0]?.message?.content ?? '{"reply":"","proposals":[]}';
    const parsed = JSON.parse(rawContent) as {
      reply: string;
      proposals: Array<{
        proposalType: 'MEDICATION' | 'ALLERGY';
        confidence: number;
        data: Record<string, unknown>;
      }>;
    };

    const tokensInput = completion.usage?.prompt_tokens ?? 0;
    const tokensOutput = completion.usage?.completion_tokens ?? 0;
    const estimatedCostUsd =
      (tokensInput / 1000) * APPROX_USD_PER_1K_INPUT_TOKENS +
      (tokensOutput / 1000) * APPROX_USD_PER_1K_OUTPUT_TOKENS;

    return {
      reply: parsed.reply,
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
}

/** Descarta las claves null que sobran del schema (uno de los dos "modos" del objeto data). */
function cleanProposal(p: {
  proposalType: 'MEDICATION' | 'ALLERGY';
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
