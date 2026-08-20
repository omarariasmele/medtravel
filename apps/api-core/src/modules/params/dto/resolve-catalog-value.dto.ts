import { IsNotEmpty, IsString } from 'class-validator';

export class ResolveCatalogValueDto {
  @IsString()
  @IsNotEmpty()
  domainCode: string;

  @IsString()
  @IsNotEmpty()
  text: string;
}
