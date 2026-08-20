import { IsString, MinLength } from 'class-validator';

export class AssignPlanDto {
  @IsString()
  @MinLength(1)
  planCode: string;
}
