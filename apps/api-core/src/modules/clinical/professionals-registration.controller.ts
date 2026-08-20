import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import * as bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';
import { QueryFailedError } from 'typeorm';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

import { RegisterProfessionalDto } from './dto/register-professional.dto';
import { ClaimShareNoteDto } from './dto/claim-share-note.dto';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

/**
 * El profesional ES un core.users (B7, ver healthcare-professional.entity.ts)
 * — no hay un segundo subsistema de autenticación. Por eso el alta
 * reutiliza core.register_person_and_user (SECURITY DEFINER, mismo que
 * /auth/register) para crear person+user+credentials, y recién después
 * inserta la fila clinical.healthcare_professionals — esa tabla no tiene
 * RLS (directorio compartido, ver SCHEMA_GAPS.md), así que el INSERT
 * corre normal con los privilegios de app_runtime, sin necesitar otra
 * función SECURITY DEFINER.
 *
 * SIN AuthGuard('jwt') a nivel de clase: un médico nuevo, por
 * definición, todavía no tiene cuenta — este alta es pública (mismo
 * criterio que /auth/register, con el mismo rate limit que ese). Login
 * después reutiliza /auth/login sin cambios (el profesional es un
 * core.users como cualquier otro); claim-note (abajo) sí requiere JWT
 * porque ahí ya hace falta saber quién es el profesional logueado.
 *
 * trust_level_id siempre arranca en REGISTERED (el nivel más bajo de
 * MTA-511) — la verificación de identidad/licencia es un flujo aparte,
 * no algo que esta alta pueda saltear.
 */
@ApiTags('clinical/professionals-registration')
@Controller('clinical/professionals-registration')
export class ProfessionalsRegistrationController {
  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly config: ConfigService,
  ) {}

  private blindIndex(value: string): string {
    const key = this.config.get<string>('DB_BLIND_INDEX_KEY')!;
    return createHmac('sha256', key)
      .update(value.trim().toLowerCase())
      .digest('hex');
  }

  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post()
  async register(@Body() dto: RegisterProfessionalDto) {
    const emailBlindIndex = this.blindIndex(dto.email);
    const docNumberIdx = this.blindIndex(dto.docNumber);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      return await this.txManager.runInTransaction(async (queryRunner) => {
        const [{ person_id, user_id }] = await queryRunner.query(
          `SELECT * FROM core.register_person_and_user($1, $2, $3, $4, $5)`,
          [
            dto.firstName,
            dto.lastName,
            dto.email,
            emailBlindIndex,
            passwordHash,
          ],
        );

        const [professional] = await queryRunner.query(
          `INSERT INTO clinical.healthcare_professionals
             (user_id, first_name, last_name, doc_type_id, doc_number, doc_number_idx,
              country_id, specialty_id, license_number, license_country_id, institution,
              gender_id, state_province, city, is_institution, tax_id,
              trust_level_id, is_active)
           VALUES ($1, $2, $3, $4, core.encrypt_pii($5), $6, $7, $8, $9, $10, $11,
              $12, $13, $14, $15, core.encrypt_pii($16),
              params.catalog_id('PROFESSIONAL_TRUST_LEVEL', 'REGISTERED'), true)
           RETURNING id, first_name, last_name, trust_level_id, is_active, created_at`,
          [
            user_id,
            dto.firstName,
            dto.lastName,
            dto.docTypeId,
            dto.docNumber,
            docNumberIdx,
            dto.countryId,
            dto.specialtyId ?? null,
            dto.licenseNumber ?? null,
            dto.licenseCountryId ?? null,
            dto.institution ?? null,
            dto.genderId ?? null,
            dto.stateProvince ?? null,
            dto.city ?? null,
            dto.isInstitution ?? false,
            dto.taxId ?? null,
          ],
        );

        // El profesional ES un core.users (comment de la clase) — teléfono
        // e idioma reusan core.users.phone/preferred_lang (ya existen,
        // core.update_user_phone ya lo usa /me/profile) en vez de agregar
        // columnas nuevas en healthcare_professionals.
        if (dto.phone) {
          const phoneIdx = this.blindIndex(dto.phone);
          await queryRunner.query(
            `SELECT core.update_user_phone($1, $2, $3)`,
            [user_id, dto.phone, phoneIdx],
          );
        }
        if (dto.preferredLang) {
          await queryRunner.query(
            `UPDATE core.users SET preferred_lang = $1 WHERE id = $2`,
            [dto.preferredLang, user_id],
          );
        }

        return { ...professional, personId: person_id, userId: user_id };
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code === '23505'
      ) {
        throw new ConflictException(
          'Ya existe un profesional con ese email o número de documento',
        );
      }
      throw error;
    }
  }

  /**
   * Reclama una nota anónima dejada antes de registrarse/loguearse (ver
   * emergency.submit_anonymous_share_note) — la promueve a un
   * encounter/encounter_submission real de este profesional. Certifica
   * solo si su trust_level ya es IDENTITY_VERIFIED+ (emergency.
   * claim_share_note decide esto, no el controller).
   */
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('claim-note')
  async claimNote(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ClaimShareNoteDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const [professional] = await queryRunner.query(
        `SELECT id FROM clinical.healthcare_professionals WHERE user_id = $1`,
        [request.user.userId],
      );
      if (!professional) {
        throw new ForbiddenException(
          'Esta cuenta no está registrada como profesional de salud',
        );
      }

      const [result] = await queryRunner.query(
        `SELECT * FROM emergency.claim_share_note($1, $2)`,
        [dto.claimToken, professional.id],
      );

      return {
        ok: result.ok,
        encounterSubmissionId: result.encounter_submission_id,
        certified: result.certified,
      };
    });
  }
}
