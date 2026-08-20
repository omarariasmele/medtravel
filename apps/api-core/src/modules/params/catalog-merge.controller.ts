import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ConfigAccessGuard } from '@common/auth/config-access.guard';

import { CatalogMergeService } from './catalog-merge.service';
import { MergeCatalogValueDto } from './dto/merge-catalog-value.dto';

/**
 * Registrado ANTES de ParamsAdminResourceController (mismo motivo que
 * SmtpSettingsController — ver comentario en params.module.ts): la
 * ruta con `/merge` al final no debería colisionar con el CRUD
 * genérico `:resource/:id`, pero se mantiene el mismo orden por las
 * dudas y por consistencia.
 */
@ApiTags('params/admin/catalog-values')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ConfigAccessGuard)
@Controller('params/admin/catalog-values')
export class CatalogMergeController {
  constructor(private readonly mergeService: CatalogMergeService) {}

  @Post(':id/merge')
  merge(@Param('id') id: string, @Body() dto: MergeCatalogValueDto) {
    return this.mergeService.merge(id, dto.targetId);
  }
}
