import { Controller, Get, NotFoundException, Param, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { join } from 'path';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

const AVATARS_DIR = join(process.cwd(), 'uploads', 'avatars');

/**
 * Datos de contacto/identidad del viajero para admin-web (ficha del
 * viajero) — teléfono, email, documento y foto viven en tablas sin
 * política RLS propia para operadores (core.users, core.
 * external_identifiers) o gateadas por has_clinical_access (core.
 * persons.photo_path vía clinical.get_patient_summary, que es el
 * criterio correcto para la vista QR/médico pero NO para acá: acá es
 * identidad básica, mismo nivel que nombre/apellido). Todos estos
 * endpoints usan el mismo criterio EXACTO que ya autoriza leer nombre/
 * apellido (persons_tenant_member_select, gap #13): operador de ESE
 * tenant, o superadmin — sin ConfigAccessGuard, sin necesitar ningún
 * caso abierto ni consentimiento clínico.
 */
@ApiTags('identity/persons')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('identity/persons')
export class PersonPhoneController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get(':id/phone')
  async getPhone(@Param('id') id: string) {
    const [row] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT * FROM core.get_person_phone_for_operator($1)`, [id]),
    );

    if (!row) {
      throw new NotFoundException('Sin acceso o sin teléfono cargado');
    }

    return { phone: row.phone, phoneVerified: row.phone_verified };
  }

  @Get(':id/email')
  async getEmail(@Param('id') id: string) {
    const [row] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT core.get_person_email_for_operator($1) AS email`, [id]),
    );

    if (!row?.email) {
      throw new NotFoundException('Sin acceso o sin email');
    }

    return { email: row.email };
  }

  /**
   * Documento (tipo/número/país) — obligatorio desde el registro (gap
   * #32) pero core.external_identifiers está excluida del CRUD genérico
   * (blind-index) y nunca tuvo lectura puntual.
   */
  @Get(':id/document')
  async getDocument(@Param('id') id: string) {
    const [row] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT * FROM core.get_person_document_for_operator($1)`, [id]),
    );

    if (!row) {
      throw new NotFoundException('Sin acceso o sin documento cargado');
    }

    return {
      docTypeId: row.doc_type_id,
      docNumber: row.doc_number,
      docCountryId: row.doc_country_id,
    };
  }

  /**
   * Foto de perfil — gap #41: distinta de /clinical/patient-photo/:id
   * (esa sigue gateada por has_clinical_access, correcta para share-
   * preview/public-share). Acá el criterio es el mismo que el resto de
   * este controller.
   */
  @Get(':id/photo')
  async getPhoto(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const [row] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT core.get_person_photo_path_for_operator($1) AS photo_path`, [id]),
    );

    if (!row?.photo_path) {
      throw new NotFoundException('Sin acceso o sin foto cargada');
    }

    res.sendFile(row.photo_path, { root: AVATARS_DIR });
  }
}
