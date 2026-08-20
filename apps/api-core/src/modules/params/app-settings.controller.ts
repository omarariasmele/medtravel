import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';
import { ConfigAccessGuard } from '@common/auth/config-access.guard';

import { AppSettingsService, AppSettingView } from './app-settings.service';
import { UpdateAppSettingDto } from './dto/update-app-setting.dto';

/**
 * Lectura abierta a cualquier usuario autenticado (la app móvil los
 * necesita para configurar el asistente de salud sin recompilar, ver
 * proposed-app-settings.sql); la escritura queda restringida a
 * canManageConfig, igual que el resto de "Catálogos / Parámetros".
 */
@ApiTags('params/app-settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('params')
export class AppSettingsController {
  constructor(private readonly appSettingsService: AppSettingsService) {}

  @Get('app-settings')
  list(): Promise<AppSettingView[]> {
    return this.appSettingsService.list();
  }

  @Put('admin/app-settings/:key')
  @UseGuards(ConfigAccessGuard)
  update(
    @Param('key') key: string,
    @Body() dto: UpdateAppSettingDto,
    @CurrentContext() context: RequestContextData,
  ): Promise<AppSettingView> {
    return this.appSettingsService.update(key, dto.value, context.userId!);
  }
}
