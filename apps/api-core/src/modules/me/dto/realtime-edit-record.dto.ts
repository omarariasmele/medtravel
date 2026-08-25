import { IsIn, IsObject, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/**
 * Lo que el celular postea cuando el motor Realtime llama a la tool
 * edit_or_delete_health_record (ver openai.provider.ts) — pedido
 * explícito del usuario: "tenemos que darle al modelo clásico la
 * posibilidad de que el usuario modifique sus antecedentes hablando
 * con la IA", ya sea corrigiendo un dato o eliminando un antecedente
 * cargado por error. `matchName` es el nombre tal como lo dijo el
 * viajero — el backend lo resuelve contra lo que realmente tiene
 * cargado (ver AIService.editOrDeleteHealthRecordByVoice).
 */
export class RealtimeEditRecordDto {
  @IsUUID()
  conversationId: string;

  @IsIn(['CONDITION', 'ALLERGY', 'MEDICATION', 'SURGERY', 'IMPLANT_DEVICE', 'TREATMENT'])
  recordType: 'CONDITION' | 'ALLERGY' | 'MEDICATION' | 'SURGERY' | 'IMPLANT_DEVICE' | 'TREATMENT';

  @IsString()
  @MinLength(1)
  matchName: string;

  @IsIn(['UPDATE', 'DELETE'])
  action: 'UPDATE' | 'DELETE';

  /** Igual que RealtimeProposalDto.data — no se valida con un DTO anidado, ver PROPOSAL_DATA_SCHEMA. Solo hace falta si action=UPDATE. */
  @IsObject()
  @IsOptional()
  data?: Record<string, unknown> | null;
}
