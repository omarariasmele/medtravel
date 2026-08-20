import { IsDateString, IsEmail, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  /** FK a params.catalog_values (dominio GENDER). */
  @IsOptional()
  @IsUUID()
  genderId?: string;

  @IsOptional()
  @IsString()
  preferredLang?: string;

  @IsOptional()
  @IsString()
  timezone?: string;

  /** Si viene, resetea phoneVerified a FALSE (core.update_user_phone) — la verificación real queda para un patch futuro. */
  @IsOptional()
  @IsString()
  phone?: string;

  /** FK a params.catalog_values (dominio BLOOD_TYPE) — atributo fijo de la persona, no un signo vital repetible (ver core.persons.blood_type_id). */
  @IsOptional()
  @IsUUID()
  bloodTypeId?: string;

  /** Si viene y es distinto al actual, resetea emailVerified a FALSE y dispara un código de verificación nuevo — ver MeProfileController.update(). */
  @IsOptional()
  @IsEmail()
  email?: string;
}
