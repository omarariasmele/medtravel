import { IsDateString, IsIn, IsOptional, IsString } from 'class-validator';

/**
 * Llega como multipart/form-data junto con el archivo (ver
 * MeClinicalController.uploadDocument) — nunca JSON puro, por eso los
 * campos viajan como texto plano y no un objeto anidado.
 */
export class UploadClinicalDocumentDto {
  /** Code de params.catalog_values (dominio CLINICAL_DOCUMENT_TYPE) — ver proposed-clinical-document-type-catalog-update.sql. */
  @IsIn(['LABORATORY', 'XRAY', 'CT_SCAN', 'MRI', 'GENERAL_STUDY', 'OTHER'])
  documentType: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Fecha en que se hizo el estudio/análisis (no la fecha de subida). */
  @IsOptional()
  @IsDateString()
  documentDate?: string;
}
