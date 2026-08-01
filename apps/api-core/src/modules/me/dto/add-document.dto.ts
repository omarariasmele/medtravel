import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class AddDocumentDto {
  /** FK a params.catalog_values (dominio DOCUMENT_TYPE). */
  @IsUUID()
  docTypeId: string;

  @IsString()
  @MinLength(3)
  docNumber: string;

  /** FK a params.catalog_values (dominio COUNTRY). */
  @IsOptional()
  @IsUUID()
  countryId?: string;
}
