import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import {
  CatalogResolutionService,
  ResolvedCatalogValue,
} from './catalog-resolution.service';
import { ResolveCatalogValueDto } from './dto/resolve-catalog-value.dto';

/**
 * Cualquier usuario/operador autenticado que esté cargando datos
 * (no es administración de catálogos) — a diferencia de
 * `params/admin/catalog-values`, que requiere `canManageConfig`.
 * Registrado ANTES de `ParamsAdminResourceController` en el módulo por
 * las dudas, aunque el prefijo `params/catalog-values` (sin `/admin`)
 * ya no colisiona con `params/admin/:resource`.
 */
@ApiTags('params/catalog-values')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('params/catalog-values')
export class CatalogValuesController {
  constructor(private readonly resolutionService: CatalogResolutionService) {}

  @Post('resolve')
  resolve(@Body() dto: ResolveCatalogValueDto): Promise<ResolvedCatalogValue> {
    return this.resolutionService.resolveOrCreate(dto.domainCode, dto.text);
  }
}
