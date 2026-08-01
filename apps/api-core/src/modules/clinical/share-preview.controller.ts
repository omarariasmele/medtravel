import {
  Controller,
  Get,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

import {
  buildSharedProfile,
  DEFAULT_SHARE_SCOPE,
} from '../shares/shared-profile.helper';

/**
 * Funcionalidad accesoria pedida por el usuario: un operador con acceso
 * clínico legítimo (caso abierto o consentimiento — mismo
 * clinical.has_clinical_access de siempre, ver x-active-case-id en
 * patient-summary.controller.ts) puede previsualizar la ficha EXACTAMENTE
 * como la vería un médico que entra por el QR/link — mismo componente de
 * armado (buildSharedProfile) y mismo scope por defecto que
 * emergency.tokens de tipo DOCTOR_INVITE, para que sea una vista
 * fiel, no una aproximación.
 */
@ApiTags('clinical/share-preview')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('clinical/share-preview')
export class SharePreviewController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get(':personId')
  async get(@Param('personId') personId: string) {
    const result = await this.txManager.runInTransaction((queryRunner) =>
      buildSharedProfile(queryRunner, personId, DEFAULT_SHARE_SCOPE),
    );

    if (!result.person) {
      throw new NotFoundException(
        'No encontrado o sin acceso clínico habilitado',
      );
    }

    return result;
  }
}
