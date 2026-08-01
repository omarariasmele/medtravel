import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { CreateHealthcareProviderDto } from './dto/create-healthcare-provider.dto';

/**
 * Lado viajero: leer prestadores de salud (obra social/prepaga/
 * hospital) para poblar el combo de "Mi cobertura", y proponer uno
 * nuevo si no está en la lista. Solo AuthGuard('jwt') — sin
 * ConfigAccessGuard (eso es para aprobar/editar/fusionar, ver
 * healthcare-providers-admin.controller.ts). Sin RLS en
 * coverage.healthcare_providers (catálogo de referencia global).
 */
@ApiTags('coverage/healthcare-providers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('coverage/healthcare-providers')
export class HealthcareProvidersController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  /**
   * Sin filtro de país por default — un viajero puede estar afiliado a
   * un prestador de un país distinto al de residencia. Filtra
   * lifecycle_status IN ('ACTIVE','APPROVED'): un prestador recién
   * propuesto (DRAFT) no debe verlo nadie más que quien lo cargó hasta
   * que un operador lo revise.
   */
  @Get()
  async list(
    @Query('countryId') countryId?: string,
    @Query('providerTypeId') providerTypeId?: string,
  ) {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT hp.id, hp.code, hp.name, hp.country_id, cv.label_es AS country_label,
                hp.provider_type_id, pt.label_es AS provider_type_label, hp.lifecycle_status
         FROM coverage.healthcare_providers hp
         JOIN params.catalog_values cv ON cv.id = hp.country_id
         JOIN params.catalog_values pt ON pt.id = hp.provider_type_id
         WHERE hp.lifecycle_status IN ('ACTIVE', 'APPROVED')
           AND hp.active = TRUE
           AND ($1::uuid IS NULL OR hp.country_id = $1)
           AND ($2::uuid IS NULL OR hp.provider_type_id = $2)
         ORDER BY hp.name`,
        [countryId ?? null, providerTypeId ?? null],
      ),
    );
  }

  @Post()
  async propose(
    @CurrentContext() context: RequestContextData,
    @Body() dto: CreateHealthcareProviderDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      let countryId = dto.countryId;
      if (!countryId) {
        const [person] = await queryRunner.query(
          `SELECT country_residence_id FROM core.persons WHERE id = $1`,
          [context.personId],
        );
        countryId = person?.country_residence_id;
      }

      const [row] = await queryRunner.query(
        `INSERT INTO coverage.healthcare_providers
           (provider_type_id, country_id, name, lifecycle_status, submitted_by_person_id)
         VALUES ($1, $2, $3, 'DRAFT', $4)
         RETURNING id`,
        [dto.providerTypeId, countryId, dto.name, context.personId],
      );
      return { id: row.id };
    });
  }
}
