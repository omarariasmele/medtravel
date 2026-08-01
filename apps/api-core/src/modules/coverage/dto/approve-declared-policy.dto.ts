import { IsDateString, IsUUID } from 'class-validator';

export class ApproveDeclaredPolicyDto {
  @IsUUID()
  planId: string;

  @IsDateString()
  validFrom: string;

  @IsDateString()
  validUntil: string;
}
