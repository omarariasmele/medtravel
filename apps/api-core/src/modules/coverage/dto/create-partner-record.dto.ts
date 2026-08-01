import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePartnerRecordDto {
  @IsString()
  @MinLength(1)
  partnerRefId: string;

  @IsOptional()
  @IsString()
  rawName?: string;

  /** Code del dominio DOCUMENT_TYPE (ej. 'NATIONAL_ID', 'PASSPORT'). */
  @IsOptional()
  @IsString()
  rawDocType?: string;

  @IsOptional()
  @IsString()
  rawDocNumber?: string;

  /** Code del dominio GENDER (ej. 'MALE', 'FEMALE') — ayuda a distinguir personas con el mismo documento. */
  @IsOptional()
  @IsString()
  rawGender?: string;

  @IsString()
  @MinLength(1)
  policyNumber: string;

  @IsOptional()
  @IsString()
  planCode?: string;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  validUntil: string;
}
