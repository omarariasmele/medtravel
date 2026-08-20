import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateEmergencyContactDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsUUID()
  relationshipTypeId?: string;

  /** false = "eliminar" (soft, mismo criterio sin-DELETE-físico del resto del schema). */
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
