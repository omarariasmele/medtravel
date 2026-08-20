import { IsArray, IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Códigos del dominio KB_ENTRY_SCOPE (params.catalog_values) — a qué
 * asistente(s) se le inyecta la entrada. Una entrada puede aplicar a
 * varios a la vez (tabla puente ai.knowledge_base_entry_scopes, gap #73).
 */
export const KB_ENTRY_SCOPES = ['EMERGENCY_CHAT', 'HEALTH_ASSISTANT', 'APP_HELP_ASSISTANT'] as const;

export class CreateKnowledgeBaseEntryDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsOptional()
  @IsArray()
  @IsIn(KB_ENTRY_SCOPES, { each: true })
  scopes?: string[];
}

export class UpdateKnowledgeBaseEntryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  content?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsArray()
  @IsIn(KB_ENTRY_SCOPES, { each: true })
  scopes?: string[];
}
