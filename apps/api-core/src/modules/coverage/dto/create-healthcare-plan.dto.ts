import { IsString, IsUUID, MinLength } from 'class-validator';

export class CreateHealthcarePlanDto {
  @IsUUID()
  providerId: string;

  @IsString()
  @MinLength(1)
  name: string;
}
