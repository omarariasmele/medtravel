import {
  Equals,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsOptional()
  @IsString()
  preferredLang?: string;

  /** Tipo de documento (params.catalog_values, dominio DOCUMENT_TYPE). */
  @IsUUID()
  docTypeId: string;

  @IsString()
  @IsNotEmpty()
  docNumber: string;

  /** País emisor del documento (params.catalog_values, dominio COUNTRY) — sistema internacional, la unicidad de documento es por país. */
  @IsUUID()
  docCountryId: string;

  @IsOptional()
  @IsString()
  phone?: string;

  /**
   * Fase 3 — consentimiento explícito para que un profesional de salud
   * pueda cargar información clínica sobre el viajero. @Equals(true)
   * a propósito: ni ausente ni en false pasan la validación, así el
   * checkbox del registro no puede quedar destildado y enviarse igual.
   */
  @Equals(true)
  consentAccepted: boolean;
}
