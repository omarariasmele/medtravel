import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;

  /** Solo necesario si el usuario tiene un core.mfa_methods TOTP activo. */
  @IsOptional()
  @IsString()
  mfaCode?: string;
}
