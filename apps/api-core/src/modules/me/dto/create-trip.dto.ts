import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

/**
 * Pedido explícito del usuario: un viaje puede visitar varios países
 * (ej. "Ecuador, Brasil y Perú") — la IA tiene que poder alertar de
 * vacunas/riesgos/seguridad de CADA uno, no solo del primero. Antes
 * el viaje tenía un único destino (país+ciudad sueltos); ahora es una
 * lista — mismas fechas del viaje para todos por ahora (itinerarios
 * con fecha propia por destino queda fuera de alcance).
 */
export class TripDestinationDto {
  /** FK a params.catalog_values (dominio COUNTRY). */
  @IsUUID()
  countryId: string;

  @IsString()
  city: string;
}

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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripDestinationDto)
  destinations?: TripDestinationDto[];
}
