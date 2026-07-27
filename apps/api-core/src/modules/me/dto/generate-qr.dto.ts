import { IsOptional, IsUUID } from 'class-validator';

export class GenerateQrDto {
  /** Si no se pasa, se usa el único member del viajero autenticado. */
  @IsOptional()
  @IsUUID()
  memberId?: string;
}
