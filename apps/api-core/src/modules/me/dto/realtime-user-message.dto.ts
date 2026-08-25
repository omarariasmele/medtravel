import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Lo que el celular postea cada vez que el motor Realtime transcribe
 * algo que dijo el viajero (ver
 * RealtimeVoiceEngine.onUserTranscript/conversation.item.input_audio_
 * transcription.completed) — bug real reportado en vivo: "Mensajes
 * hoy" del dashboard de consumo mostraba 0 con conversaciones activas
 * reales, porque nada guardaba el lado del VIAJERO de la charla como
 * mensaje (solo se mostraba en pantalla). Fire-and-forget del lado
 * del celular, no bloquea la conversación de voz si falla.
 */
export class RealtimeUserMessageDto {
  @IsUUID()
  conversationId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}
