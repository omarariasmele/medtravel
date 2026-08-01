import { IsEmail } from 'class-validator';

export class UpdateOperatorAccountDto {
  @IsEmail()
  email: string;
}
