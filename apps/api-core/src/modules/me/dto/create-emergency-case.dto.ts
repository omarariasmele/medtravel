import {
  IsBoolean,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateEmergencyCaseDto {
  /** Si no se pasa, se usa el único member del viajero autenticado. */
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsString()
  @MinLength(5)
  initialDescription: string;

  @IsOptional()
  @IsString()
  patientSymptoms?: string;

  @IsOptional()
  @IsBoolean()
  patientConscious?: boolean;

  @IsOptional()
  @IsLatitude()
  latitude?: number;

  @IsOptional()
  @IsLongitude()
  longitude?: number;

  @IsOptional()
  @IsNumber()
  locationAccuracy?: number;
}
