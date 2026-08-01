import { IsOptional, IsString, MinLength } from 'class-validator';

export class SubmitShareNoteDto {
  @IsString()
  @MinLength(2)
  accessorName: string;

  @IsOptional()
  @IsString()
  accessorEmail?: string;

  @IsOptional()
  @IsString()
  accessorSpecialty?: string;

  @IsOptional()
  @IsString()
  accessorInstitution?: string;

  @IsOptional()
  @IsString()
  recommendations?: string;

  @IsOptional()
  @IsString()
  treatment?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
