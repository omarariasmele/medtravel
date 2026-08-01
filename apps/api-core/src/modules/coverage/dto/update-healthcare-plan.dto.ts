import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

import { PlanLifecycleStatus } from './../entities/healthcare-plan.entity';

export class UpdateHealthcarePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'APPROVED', 'ACTIVE', 'RETIRED'])
  lifecycleStatus?: PlanLifecycleStatus;

  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
