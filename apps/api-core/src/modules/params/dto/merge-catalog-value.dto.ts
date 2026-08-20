import { IsNotEmpty, IsUUID } from 'class-validator';

export class MergeCatalogValueDto {
  @IsUUID()
  @IsNotEmpty()
  targetId: string;
}
