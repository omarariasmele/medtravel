import { IsEmail, IsIn, IsInt, IsOptional, IsPositive, IsUUID } from 'class-validator';

export class CreateDoctorInviteDto {
  /** Si no se pasa, se usa el único member del viajero autenticado. */
  @IsOptional()
  @IsUUID()
  memberId?: string;

  /** Sin límite si no se pasa — el vencimiento por tiempo ya acota el riesgo. */
  @IsOptional()
  @IsInt()
  @IsPositive()
  maxUses?: number;

  /** Si se pasa, el link recién creado se manda por mail además de devolverse (pedido explícito del usuario). */
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  /**
   * Pedido explícito del usuario: poder elegir en qué idioma ve la
   * ficha el médico que abra el link — si viene y no es 'es', se
   * traduce UNA vez con IA al generar el token (ver
   * OpenAIProvider.translateSharedProfile) y queda fijo para la vida
   * útil de ese link, no se re-traduce en cada vista.
   */
  @IsOptional()
  @IsIn(['es', 'en', 'pt', 'fr'])
  language?: string;
}
