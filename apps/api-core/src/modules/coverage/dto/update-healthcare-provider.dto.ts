import { IsBoolean, IsIn, IsOptional, IsString, IsUUID } from 'class-validator';

import { ProviderLifecycleStatus } from '../entities/healthcare-provider.entity';

export class UpdateHealthcareProviderDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsUUID()
  providerTypeId?: string;

  @IsOptional()
  @IsUUID()
  countryId?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'APPROVED', 'ACTIVE', 'RETIRED'])
  lifecycleStatus?: ProviderLifecycleStatus;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
