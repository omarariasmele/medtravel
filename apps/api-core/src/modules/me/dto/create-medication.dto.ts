import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateMedicationDto {
  @IsString()
  @IsNotEmpty()
  genericName: string;

  @IsOptional()
  @IsString()
  brandName?: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
