import { IsInt, IsUUID, Min } from 'class-validator';

/**
 * Lo que el celular postea cada vez que el motor Realtime recibe un
 * evento response.done con datos de uso de tokens (ver
 * RealtimeVoiceEngine._handleUsage en realtime_voice_engine.dart) —
 * bug real reportado en vivo: el dashboard de consumo mostraba $0 para
 * toda la actividad del día porque nada capturaba esto antes.
 */
export class RealtimeUsageDto {
  @IsUUID()
  conversationId: string;

  @IsInt()
  @Min(0)
  textInputTokens: number;

  @IsInt()
  @Min(0)
  audioInputTokens: number;

  @IsInt()
  @Min(0)
  cachedInputTokens: number;

  @IsInt()
  @Min(0)
  textOutputTokens: number;

  @IsInt()
  @Min(0)
  audioOutputTokens: number;

  @IsInt()
  @Min(0)
  totalInputTokens: number;

  @IsInt()
  @Min(0)
  totalOutputTokens: number;
}
