import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { join } from 'path';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

const AVATARS_DIR = join(process.cwd(), 'uploads', 'avatars');

/**
 * Sirve la foto de perfil de un viajero — nunca vía directorio estático
 * público (es un dato personal, mismo control de acceso que el resto de
 * la ficha clínica): pasa por clinical.get_patient_summary(), que ya
 * gatea con clinical.has_clinical_access (titular, consentimiento, caso
 * activo). AuthGuard('jwt') solo exige "algún usuario autenticado" — la
 * autorización real es 100% la de has_clinical_access.
 */
@ApiTags('clinical/patient-photo')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('clinical/patient-photo')
export class PatientPhotoController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get(':personId')
  async get(
    @Param('personId') personId: string,
    @Res() res: Response,
  ): Promise<void> {
    const [row] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT * FROM clinical.get_patient_summary($1)`, [
        personId,
      ]),
    );

    if (!row?.photo_path) {
      throw new NotFoundException('Sin foto de perfil o sin acceso clínico habilitado');
    }

    res.sendFile(row.photo_path, { root: AVATARS_DIR });
  }
}
