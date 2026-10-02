import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { createHash, randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { readFile } from 'fs/promises';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';
import { mapPgError } from '@common/database/pg-error.mapper';
import { CLINICAL_DOCUMENTS_DIR } from '@modules/clinical/patient-document-file.controller';

import { CreateAllergyDto } from './dto/create-allergy.dto';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UploadClinicalDocumentDto } from './dto/upload-clinical-document.dto';

const ALLOWED_DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

class ChallengeEncounterDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/**
 * provenance_id siempre 'SELF_DECLARED' y canonical_status_id siempre
 * 'PROVISIONAL' acá a propósito, sin dejar que el cliente los elije —
 * son parte del modelo de estados MTA-511 (ver allergy.entity.ts) y
 * solo un profesional certificado (otro flujo, no este) puede mover un
 * dato a IN_CANONICAL/PROFESSIONALLY_CERTIFIED. No es "hardcodear una
 * regla de negocio", es proteger la máquina de estados.
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/clinical')
export class MeClinicalController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  /**
   * Pedido explícito del usuario: "las notas se deben poder visualizar
   * en el viajero... en el historial de salud como 'atenciones
   * recibidas'... abajo de documentos" — las notas que deja un médico
   * al reclamar (emergency.claim_share_note) ya se guardan como
   * clinical.encounters/encounter_submissions; acá solo faltaba una
   * forma de que el viajero las vea. Certification/confirmation status
   * se devuelven tal cual (no una etiqueta ya armada) para que la app
   * pueda mostrar "Certificada" vs "Pendiente de tu confirmación" en el
   * idioma del viajero — la acción de aprobar/objetar queda pendiente
   * para otro momento (no hay ninguna pantalla que la use todavía).
   */
  @Get('encounters')
  async listEncounters(@CurrentContext() context: RequestContextData) {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        // Bug real reportado en vivo: "Profesional sin identificar" +
        // sin fecha en Atenciones recibidas — queryRunner.query() (SQL
        // crudo) devuelve las columnas TAL CUAL las escribe Postgres,
        // sin ningún camelCase automático (a diferencia de leer vía
        // entidades TypeORM). Un alias sin comillas como
        // "professional_first_name" queda snake_case en la respuesta,
        // pero admin-web/mobile leen `professionalFirstName` — nunca
        // coincidían. Los alias entre comillas dobles preservan
        // mayúsculas/minúsculas tal cual se escriben.
        `SELECT e.id, e.encounter_date AS "encounterDate", e.encounter_type_id AS "encounterTypeId",
                e.chief_complaint AS "chiefComplaint", e.notes,
                es.id AS "submissionId", es.clinical_data AS "clinicalData",
                es.member_reviewed_at AS "memberReviewedAt", es.platform_reviewed_at AS "platformReviewedAt",
                cert_cv.code AS "certificationCode", conf_cv.code AS "confirmationCode",
                hp.first_name AS "professionalFirstName", hp.last_name AS "professionalLastName",
                hp.institution AS "professionalInstitution", hp.specialty_id AS "professionalSpecialtyId",
                hp.license_number AS "professionalLicenseNumber",
                core.decrypt_pii(hp.doc_number) AS "professionalDocNumber",
                hp.doc_type_id AS "professionalDocTypeId",
                hp.country_id AS "professionalCountryId",
                hp.is_active AS "professionalIsActive"
         FROM clinical.encounters e
         LEFT JOIN clinical.encounter_submissions es
           ON es.encounter_id = e.id AND es.deleted_at IS NULL
         LEFT JOIN clinical.healthcare_professionals hp ON hp.id = e.professional_id
         LEFT JOIN params.catalog_values cert_cv ON cert_cv.id = es.certification_status_id
         LEFT JOIN params.catalog_values conf_cv ON conf_cv.id = es.confirmation_status_id
         WHERE e.person_id = $1
         ORDER BY e.encounter_date DESC, e.created_at DESC`,
        [context.personId],
      ),
    );
  }

  /**
   * Fase 3 — el viajero confirma una nota cargada por un médico.
   * WHERE person_id = $2 es defensa en profundidad (RLS ya lo exige vía
   * submission_update/clinical.has_clinical_access), no reemplaza nada.
   * Mismo UPDATE probado en 009_tests.sql (T2.2).
   */
  @Patch('encounters/:submissionId/confirm')
  async confirmEncounter(
    @CurrentContext() context: RequestContextData,
    @Param('submissionId') submissionId: string,
  ) {
    await this.txManager.runInTransaction(async (queryRunner) => {
      const [row] = await queryRunner.query(
        `UPDATE clinical.encounter_submissions SET
           canonical_status_id    = params.catalog_id('CANONICAL_STATUS','IN_CANONICAL'),
           confirmation_status_id = params.catalog_id('CONFIRMATION_STATUS','MEMBER_CONFIRMED'),
           member_confirmed        = TRUE,
           member_reviewed_at      = NOW()
         WHERE id = $1 AND person_id = $2
         RETURNING id`,
        [submissionId, context.personId],
      );
      if (!row) throw new NotFoundException('Atención no encontrada');
      // Pedido explícito del usuario: confirmar la atención tiene que
      // confirmar TAMBIÉN cualquier condición/medicación que el médico
      // haya cargado a partir de ella — una sola acción, un resultado
      // coherente en todo el Historial de Salud.
      await queryRunner.query(`SELECT clinical.cascade_submission_confirmation($1, TRUE)`, [submissionId]);
    });
    return { ok: true };
  }

  /**
   * Fase 3 — el viajero objeta una nota cargada por un médico. No
   * revierte canonical_status_id (el dato no se borra, ver
   * encounter-submission.entity.ts) — solo marca la objeción para que
   * quede visible.
   */
  @Patch('encounters/:submissionId/challenge')
  async challengeEncounter(
    @CurrentContext() context: RequestContextData,
    @Param('submissionId') submissionId: string,
    @Body() dto: ChallengeEncounterDto,
  ) {
    await this.txManager.runInTransaction(async (queryRunner) => {
      const [row] = await queryRunner.query(
        `UPDATE clinical.encounter_submissions SET
           member_challenged       = TRUE,
           member_challenge_notes  = $3,
           member_reviewed_at      = NOW(),
           confirmation_status_id  = params.catalog_id('CONFIRMATION_STATUS','MEMBER_CHALLENGED')
         WHERE id = $1 AND person_id = $2
         RETURNING id`,
        [submissionId, context.personId, dto.notes ?? null],
      );
      if (!row) throw new NotFoundException('Atención no encontrada');
      await queryRunner.query(`SELECT clinical.cascade_submission_confirmation($1, FALSE, $2)`, [
        submissionId,
        dto.notes ?? null,
      ]);
    });
    return { ok: true };
  }

  @Get('allergies')
  async listAllergies(@CurrentContext() context: RequestContextData) {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT id, core.decrypt_pii(allergen_name) AS allergen_name,
                allergen_type_id, severity_id,
                canonical_status_id, confirmation_status_id,
                core.decrypt_pii(notes) AS notes
         FROM clinical.allergies
         WHERE person_id = $1 AND active = TRUE
         ORDER BY created_at DESC`,
        [context.personId],
      ),
    );
  }

  /** gap #46: clinical.allergies tiene un trigger que rechaza duplicados (23505) — mapPgError lo traduce a 409. */
  @Post('allergies')
  async createAllergy(
    @CurrentContext() context: RequestContextData,
    @Body() dto: CreateAllergyDto,
  ) {
    try {
      return await this.txManager.runInTransaction(async (queryRunner) => {
        const rows = await queryRunner.query(
          `INSERT INTO clinical.allergies
             (person_id, allergen_name, allergen_type_id, severity_id,
              canonical_status_id, provenance_id, notes)
           VALUES (
             $1, core.encrypt_pii($2),
             params.catalog_id('ALLERGEN_TYPE', $3),
             params.catalog_id('REACTION_SEVERITY', $4),
             params.catalog_id('CANONICAL_STATUS', 'PROVISIONAL'),
             params.catalog_id('PROVENANCE_TYPE', 'SELF_DECLARED'),
             core.encrypt_pii($5)
           )
           RETURNING id, core.decrypt_pii(allergen_name) AS allergen_name,
                     allergen_type_id, severity_id,
                     canonical_status_id, core.decrypt_pii(notes) AS notes`,
          [
            context.personId,
            dto.allergenName,
            dto.allergenType,
            dto.severity,
            dto.notes ?? null,
          ],
        );
        return rows[0];
      });
    } catch (error) {
      mapPgError(error);
    }
  }

  @Get('medications')
  async listMedications(@CurrentContext() context: RequestContextData) {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT id, core.decrypt_pii(generic_name) AS generic_name,
                core.decrypt_pii(brand_name) AS brand_name, is_current,
                canonical_status_id, confirmation_status_id,
                core.decrypt_pii(notes) AS notes
         FROM clinical.medications
         WHERE person_id = $1 AND active = TRUE
         ORDER BY created_at DESC`,
        [context.personId],
      ),
    );
  }

  /** gap #46: clinical.medications tiene un trigger que rechaza duplicados (23505) — mapPgError lo traduce a 409. */
  @Post('medications')
  async createMedication(
    @CurrentContext() context: RequestContextData,
    @Body() dto: CreateMedicationDto,
  ) {
    try {
      return await this.txManager.runInTransaction(async (queryRunner) => {
        const rows = await queryRunner.query(
          `INSERT INTO clinical.medications
             (person_id, generic_name, brand_name, is_current,
              canonical_status_id, provenance_id, notes)
           VALUES (
             $1, core.encrypt_pii($2), core.encrypt_pii($3), $4,
             params.catalog_id('CANONICAL_STATUS', 'PROVISIONAL'),
             params.catalog_id('PROVENANCE_TYPE', 'SELF_DECLARED'),
             core.encrypt_pii($5)
           )
           RETURNING id, core.decrypt_pii(generic_name) AS generic_name,
                     core.decrypt_pii(brand_name) AS brand_name, is_current,
                     canonical_status_id, core.decrypt_pii(notes) AS notes`,
          [
            context.personId,
            dto.genericName,
            dto.brandName ?? null,
            dto.isCurrent ?? true,
            dto.notes ?? null,
          ],
        );
        return rows[0];
      });
    } catch (error) {
      mapPgError(error);
    }
  }

  /**
   * Pedido explícito del usuario: poder subir análisis/radiografías/
   * estudios (PDF/JPG/PNG) para que el médico que atiende una
   * emergencia los vea junto al resto de la Ficha de Salud, y el
   * propio viajero también pueda volver a verlos. clinical.documents
   * ya existía completo en el schema (005_clinical.sql) desde antes —
   * lo único que faltaba era este endpoint y los catalog_values de sus
   * 3 dominios (ver proposed-clinical-document-catalog-values.sql).
   * Mismo patrón de disco que MeProfileController.uploadPhoto (nombre
   * en disco = UUID random, nunca el nombre original ni el personId).
   */
  @Get('documents')
  async listDocuments(@CurrentContext() context: RequestContextData) {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT id, document_type_id, core.decrypt_pii(title) AS title,
                core.decrypt_pii(description) AS description, document_date,
                mime_type, file_size_bytes, core.decrypt_pii(file_name_original) AS file_name_original,
                show_on_emergency, created_at
         FROM clinical.documents
         WHERE person_id = $1 AND deleted_at IS NULL
         ORDER BY document_date DESC NULLS LAST, created_at DESC`,
        [context.personId],
      ),
    );
  }

  @Post('documents')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: CLINICAL_DOCUMENTS_DIR,
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 15 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_DOCUMENT_MIME_TYPES.includes(file.mimetype)) {
          cb(new BadRequestException('Solo se aceptan archivos PDF, JPG o PNG'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  async uploadDocument(
    @CurrentContext() context: RequestContextData,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadClinicalDocumentDto,
  ) {
    if (!file) {
      throw new BadRequestException('Falta el archivo');
    }
    // diskStorage (a diferencia de memoryStorage) ya escribió el
    // archivo a disco antes de llegar acá y no expone file.buffer —
    // el hash se calcula leyendo el archivo recién escrito.
    const fileBuffer = await readFile(join(CLINICAL_DOCUMENTS_DIR, file.filename));
    const fileHash = createHash('sha256').update(fileBuffer).digest('hex');

    return this.txManager.runInTransaction(async (queryRunner) => {
      const [row] = await queryRunner.query(
        `INSERT INTO clinical.documents
           (person_id, document_type_id, file_name_original, file_name_storage, file_extension,
            file_size_bytes, file_hash_sha256, mime_type, storage_path, is_encrypted,
            title, description, document_date, show_on_emergency,
            access_level_id, canonical_status_id, provenance_id, status_id, uploaded_by)
         VALUES (
           $1, params.catalog_id('CLINICAL_DOCUMENT_TYPE', $2), core.encrypt_pii($3), $4, $5,
           $6, $7, $8, $4, FALSE,
           core.encrypt_pii($9), core.encrypt_pii($10), $11, TRUE,
           params.catalog_id('ACCESS_LEVEL', 'STANDARD'),
           params.catalog_id('CANONICAL_STATUS', 'PROVISIONAL'),
           params.catalog_id('PROVENANCE_TYPE', 'SELF_DECLARED'),
           params.catalog_id('DOCUMENT_STATUS', 'ACTIVE'),
           $12
         )
         RETURNING id, document_type_id, core.decrypt_pii(title) AS title, document_date,
                   mime_type, file_size_bytes, core.decrypt_pii(file_name_original) AS file_name_original`,
        [
          context.personId,
          dto.documentType,
          file.originalname,
          file.filename,
          extname(file.originalname).replace(/^\./, '').toLowerCase(),
          file.size,
          fileHash,
          file.mimetype,
          dto.title ?? null,
          dto.description ?? null,
          dto.documentDate ?? null,
          context.userId,
        ],
      );
      return row;
    });
  }
}
