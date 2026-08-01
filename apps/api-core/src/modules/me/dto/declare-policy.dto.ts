import { IsString, IsUUID, MinLength } from 'class-validator';

export class DeclarePolicyDto {
  @IsUUID()
  tenantId: string;

  @IsString()
  @MinLength(1)
  policyNumber: string;
}
