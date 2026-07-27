import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { SmtpSettingsService, SmtpSettingsView } from './smtp-settings.service';
import { UpdateSmtpSettingsDto } from './dto/smtp-settings.dto';

/**
 * Restringido al Superadmin de plataforma
 * (core.has_platform_config_access() — ver
 * proposed-password-reset-and-smtp.sql): la RLS de params.smtp_settings
 * ya lo exige para cualquier operación, el guard acá solo evita repartir
 * un error 500 crudo antes de llegar a Postgres.
 */
@ApiTags('params/admin/smtp-settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('params/admin/smtp-settings')
export class SmtpSettingsController {
  constructor(private readonly smtpSettingsService: SmtpSettingsService) {}

  @Get()
  get(): Promise<SmtpSettingsView> {
    return this.smtpSettingsService.get();
  }

  @Put()
  update(
    @Body() dto: UpdateSmtpSettingsDto,
    @CurrentContext() context: RequestContextData,
  ): Promise<SmtpSettingsView> {
    return this.smtpSettingsService.upsert(dto, context.userId!);
  }
}
