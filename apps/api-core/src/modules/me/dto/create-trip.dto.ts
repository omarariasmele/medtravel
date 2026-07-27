import { IsDateString, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateTripDto {
  /** Si no se pasa, se usa el único member del viajero autenticado. */
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @IsString()
  tripName?: string;

  @IsDateString()
  tripStart: string;

  @IsDateString()
  tripEnd: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
