import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const ALLERGEN_TYPES = ['MEDICATION', 'FOOD', 'ENVIRONMENTAL', 'OTHER'];
const SEVERITIES = ['MILD', 'MODERATE', 'SEVERE', 'CRITICAL'];

export class CreateAllergyDto {
  @IsString()
  @IsNotEmpty()
  allergenName: string;

  @IsIn(ALLERGEN_TYPES)
  allergenType: string;

  @IsIn(SEVERITIES)
  severity: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
