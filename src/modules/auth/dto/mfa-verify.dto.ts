import { IsNotEmpty, IsString } from 'class-validator';

export class MfaVerifyDto {
  @IsString()
  @IsNotEmpty()
  code: string;
}
