import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';

import { CreateHealthcarePlanDto } from './dto/create-healthcare-plan.dto';

/**
 * Lado viajero: leer los planes de un proveedor (obra social/prepaga)
 * para poblar el combo de "Mi cobertura", y proponer uno nuevo si no
 * está en la lista. Solo AuthGuard('jwt') — cualquier viajero logueado
 * puede leer/proponer, sin ConfigAccessGuard (eso es para
 * aprobar/editar/fusionar, ver healthcare-plans-admin.controller.ts).
 * Sin RLS en coverage.healthcare_plans (catálogo de referencia global,
 * mismo criterio que params.domain_catalogs/catalog_values).
 */
@ApiTags('coverage/healthcare-plans')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('coverage/healthcare-plans')
export class HealthcarePlansController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  /**
   * Filtra lifecycle_status IN ('ACTIVE','APPROVED') — mismo criterio
   * que CatalogsService.findActiveValuesByDomain(): un plan recién
   * propuesto (DRAFT) no debe verlo nadie más que quien lo cargó hasta
   * que un operador lo revise.
   */
  @Get()
  async list(@Query('providerId') providerId: string) {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT id, name, lifecycle_status
         FROM coverage.healthcare_plans
         WHERE provider_id = $1
           AND lifecycle_status IN ('ACTIVE', 'APPROVED')
           AND active = TRUE
         ORDER BY name`,
        [providerId],
      ),
    );
  }

  @Post()
  async propose(
    @CurrentContext() context: RequestContextData,
    @Body() dto: CreateHealthcarePlanDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const [row] = await queryRunner.query(
        `INSERT INTO coverage.healthcare_plans
           (provider_id, name, lifecycle_status, submitted_by_person_id)
         VALUES ($1, $2, 'DRAFT', $3)
         RETURNING id`,
        [dto.providerId, dto.name, context.personId],
      );
      return { id: row.id };
    });
  }
}
