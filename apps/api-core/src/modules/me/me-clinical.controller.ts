import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { CreateAllergyDto } from './dto/create-allergy.dto';
import { CreateMedicationDto } from './dto/create-medication.dto';

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

  @Post('allergies')
  async createAllergy(
    @CurrentContext() context: RequestContextData,
    @Body() dto: CreateAllergyDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
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

  @Post('medications')
  async createMedication(
    @CurrentContext() context: RequestContextData,
    @Body() dto: CreateMedicationDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
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
  }
}
