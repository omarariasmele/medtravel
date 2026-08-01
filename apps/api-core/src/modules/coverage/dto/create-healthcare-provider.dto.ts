import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateHealthcareProviderDto {
  @IsString()
  @MinLength(2)
  name: string;

  /** FK a params.catalog_values (dominio HEALTH_COVERAGE_TYPE) — obra social vs. prepaga. */
  @IsUUID()
  providerTypeId: string;

  /** Opcional — si no se manda, el backend usa el país de residencia del viajero. */
  @IsOptional()
  @IsUUID()
  countryId?: string;
}
