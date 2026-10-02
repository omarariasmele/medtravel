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

export const CLINICAL_DOCUMENTS_DIR = join(process.cwd(), 'uploads', 'clinical-documents');

/**
 * Pedido explícito del usuario: "el médico que atiende el caso de
 * emergencia pueda visualizarlos cuando se le comparta el Historial de
 * Salud, además desde el usuario que se puedan visualizar" — mismo
 * archivo, dos consumidores (el propio viajero y un operador con
 * acceso clínico al caso). A diferencia de patient-photo.controller.ts
 * (que necesita pasar por clinical.get_patient_summary porque
 * core.persons.photo_path no tiene RLS propia), clinical.documents SÍ
 * tiene su propia RLS por fila (clinical.has_clinical_access(person_id),
 * ver 005_clinical.sql) — un SELECT normal contra la tabla ya alcanza,
 * no hace falta ninguna función especial: si la fila no es visible para
 * quien pide, la consulta devuelve 0 filas sola.
 */
@ApiTags('clinical/documents')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('clinical/documents')
export class PatientDocumentFileController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get(':id/file')
  async getFile(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const [row] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT file_name_storage, mime_type, core.decrypt_pii(file_name_original) AS file_name_original
         FROM clinical.documents WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      ),
    );

    if (!row) {
      throw new NotFoundException('Documento no encontrado o sin acceso clínico habilitado');
    }

    res.setHeader('Content-Type', row.mime_type);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(row.file_name_original ?? row.file_name_storage)}"`,
    );
    res.sendFile(row.file_name_storage, { root: CLINICAL_DOCUMENTS_DIR });
  }
}
