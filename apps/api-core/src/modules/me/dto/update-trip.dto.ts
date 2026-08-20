import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsOptional, IsString, ValidateNested } from 'class-validator';

import { TripDestinationDto } from './create-trip.dto';

/**
 * Pedido explícito del usuario: poder corregir un viaje ya cargado
 * (se puede haber equivocado al ingresarlo) — todos los campos
 * opcionales, se actualiza solo lo que venga. `destinations`, si
 * viene, REEMPLAZA la lista completa de destinos del viaje (no hace
 * merge campo por campo) — mismo criterio simple que evita bugs de
 * diffing parcial.
 */
export class UpdateTripDto {
  @IsOptional()
  @IsString()
  tripName?: string;

  @IsOptional()
  @IsDateString()
  tripStart?: string;

  @IsOptional()
  @IsDateString()
  tripEnd?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TripDestinationDto)
  destinations?: TripDestinationDto[];
}
