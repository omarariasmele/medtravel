import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

interface AuthenticatedRequest extends Request {
  user: {
    userId: string;
    tenantId?: string;
    canManageConfig: boolean;
    canManageOperators: boolean;
  };
}

interface DashboardStatsRow {
  tenant_id: string;
  tenant_name: string;
  is_platform_tenant: boolean;
  traveler_count: string;
  trip_count: string;
  open_case_count: string;
}

export interface DashboardStatsView {
  tenantId: string;
  tenantName: string;
  isPlatformTenant: boolean;
  travelerCount: number;
  tripCount: number;
  openCaseCount: number;
}

/**
 * Indicadores del dashboard (operations.get_tenant_dashboard_stats,
 * SECURITY DEFINER) — un superadmin (canManageConfig) ve una fila por
 * cada empresa, un operador normal ve solo la suya. El controller es
 * quien decide NULL vs. su propio tenantId, nunca el body/query del
 * cliente — así un operador normal no puede pedir "todas" pasando algo
 * por parámetro.
 */
@ApiTags('operations/dashboard-stats')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('operations/dashboard-stats')
export class DashboardStatsController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get()
  async get(
    @Req() request: AuthenticatedRequest,
  ): Promise<DashboardStatsView[]> {
    const tenantFilter = request.user.canManageConfig
      ? null
      : request.user.tenantId;

    const rows: DashboardStatsRow[] = await this.txManager.runInTransaction(
      (queryRunner) =>
        queryRunner.query(
          `SELECT * FROM operations.get_tenant_dashboard_stats($1)`,
          [tenantFilter],
        ),
    );

    return rows.map((r) => ({
      tenantId: r.tenant_id,
      tenantName: r.tenant_name,
      isPlatformTenant: r.is_platform_tenant,
      travelerCount: Number(r.traveler_count),
      tripCount: Number(r.trip_count),
      openCaseCount: Number(r.open_case_count),
    }));
  }
}
