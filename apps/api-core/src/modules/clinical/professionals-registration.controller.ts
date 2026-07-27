import {
  Body,
  ConflictException,
  Controller,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';
import { QueryFailedError } from 'typeorm';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

import { RegisterProfessionalDto } from './dto/register-professional.dto';

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
 * trust_level_id siempre arranca en REGISTERED (el nivel más bajo de
 * MTA-511) — la verificación de identidad/licencia es un flujo aparte,
 * no algo que esta alta pueda saltear.
 */
@ApiTags('clinical/professionals-registration')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
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
              trust_level_id, is_active)
           VALUES ($1, $2, $3, $4, core.encrypt_pii($5), $6, $7, $8, $9, $10, $11,
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
          ],
        );

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
}
