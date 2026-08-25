import { IsIn, IsNumber, IsObject, IsUUID, Max, Min } from 'class-validator';

/**
 * Lo que el celular postea cuando el motor Realtime del modo Clásico
 * llama a la tool `save_health_proposal` (ver REALTIME_HEALTH_PROPOSAL_TOOL
 * en openai.provider.ts) — mismo shape que un ítem del array "proposals"
 * del modelo de texto, así AIService.applyConfirmedProposal no necesita
 * ninguna rama nueva para guardarlo.
 */
export class RealtimeProposalDto {
  @IsUUID()
  conversationId: string;

  @IsIn(['MEDICATION', 'ALLERGY', 'CONDITION', 'SURGERY', 'VITALS', 'LAB_RESULT', 'IMPLANT_DEVICE', 'TREATMENT'])
  proposalType: 'MEDICATION' | 'ALLERGY' | 'CONDITION' | 'SURGERY' | 'VITALS' | 'LAB_RESULT' | 'IMPLANT_DEVICE' | 'TREATMENT';

  @IsNumber()
  @Min(0)
  @Max(1)
  confidence: number;

  /**
   * Campos específicos por proposalType — no se valida con un DTO
   * anidado a propósito (duplicaría el JSON schema que ya valida
   * OpenAI del lado del modelo, ver PROPOSAL_DATA_SCHEMA). Cualquier
   * dato mal formado lo rechaza applyConfirmedProposal al insertar.
   */
  @IsObject()
  data: Record<string, unknown>;
}
