import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CatalogsService } from './catalogs.service';
import { CatalogValueResponseDto } from './dto/catalog-value-response.dto';

@ApiTags('params')
@Controller('params/catalogs')
export class CatalogsController {
  constructor(private readonly catalogsService: CatalogsService) {}

  @Get(':domainCode')
  @ApiOperation({
    summary: 'Lista los valores activos de un catálogo de dominio',
  })
  @ApiOkResponse({ type: CatalogValueResponseDto, isArray: true })
  findByDomain(
    @Param('domainCode') domainCode: string,
    @Query('tenantId') tenantId?: string,
  ): Promise<CatalogValueResponseDto[]> {
    return this.catalogsService.findActiveValuesByDomain(domainCode, tenantId);
  }
}
