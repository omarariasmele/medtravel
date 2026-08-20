import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ConfigAccessGuard } from '@common/auth/config-access.guard';

import { AIService } from './ai.service';

/**
 * Pedido explícito del usuario: botón "Actualizar con IA" en la
 * pantalla admin de destination-health-info — dispara la búsqueda web
 * real (ver AIService.getDestinationHealthInfo/lookupDestinationHealthInfo)
 * aunque ya exista una fila cargada a mano, para refrescarla. Mismo
 * guard que el resto de /ai/admin (ConfigAccessGuard) — no es CRUD
 * genérico así que va en un controller aparte, montado en el mismo
 * prefijo sin pisar las rutas de createResourceController.
 */
@ApiTags('ai/admin')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ConfigAccessGuard)
@Controller('ai/admin/destination-health-info')
export class DestinationHealthInfoAdminController {
  constructor(private readonly aiService: AIService) {}

  @Post(':countryId/refresh')
  refresh(@Param('countryId') countryId: string) {
    return this.aiService.getDestinationHealthInfo(countryId, true);
  }
}
