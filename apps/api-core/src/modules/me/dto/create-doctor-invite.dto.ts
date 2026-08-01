import { IsInt, IsOptional, IsPositive, IsUUID } from 'class-validator';

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
}
