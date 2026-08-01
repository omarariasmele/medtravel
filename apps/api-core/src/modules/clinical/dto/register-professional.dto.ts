import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class RegisterProfessionalDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsUUID()
  docTypeId: string;

  @IsString()
  docNumber: string;

  @IsUUID()
  countryId: string;

  @IsOptional()
  @IsUUID()
  specialtyId?: string;

  @IsOptional()
  @IsString()
  licenseNumber?: string;

  @IsOptional()
  @IsUUID()
  licenseCountryId?: string;

  @IsOptional()
  @IsString()
  institution?: string;

  @IsOptional()
  @IsUUID()
  genderId?: string;

  @IsOptional()
  @IsString()
  stateProvince?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsBoolean()
  isInstitution?: boolean;

  /** CUIT/dato impositivo — solo tiene sentido si isInstitution. */
  @IsOptional()
  @IsString()
  taxId?: string;
}
