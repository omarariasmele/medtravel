import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

/**
 * Vista aplanada para "Usuarios / viajeros" — reemplaza el fetch N+1
 * que hacía travelers-list.page.tsx (un GET /identity/persons/:id por
 * cada member) y agrega lo que faltaba: país de residencia, idioma
 * preferido, y la membresía de asistencia al viajero (empresa, plan,
 * N° de póliza, vigencia real del servicio) — antes solo se veía
 * "Onboarding" (siempre vacío, no existe la pantalla de Flutter
 * todavía) y la fecha de alta del member (no la vigencia real del
 * servicio). RLS de core.members/coverage.travel_assistance_enrollments
 * ya tiene bypass para canManageConfig (proposed-platform-tenant-and-
 * config-bypass.sql) — no hace falta ninguna función SECURITY DEFINER
 * nueva, corre con los permisos normales del operador autenticado.
 */
@ApiTags('identity/travelers-overview')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('identity/travelers-overview')
export class TravelersOverviewController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get()
  async list() {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT m.id AS member_id, m.tenant_id, m.status_id,
                p.id AS person_id,
                core.decrypt_pii(p.first_name) AS first_name,
                core.decrypt_pii(p.last_name) AS last_name,
                p.country_residence_id, p.preferred_lang,
                t.name AS tenant_name,
                tae.policy_number, tae.valid_from, tae.valid_until, tae.status_authority,
                ap.name AS plan_name
         FROM core.members m
         JOIN core.persons p ON p.id = m.person_id
         LEFT JOIN core.tenants t ON t.id = m.tenant_id
         LEFT JOIN LATERAL (
           SELECT * FROM coverage.travel_assistance_enrollments e
           WHERE e.member_id = m.id
           ORDER BY e.valid_until DESC
           LIMIT 1
         ) tae ON TRUE
         LEFT JOIN coverage.assistance_plans ap ON ap.id = tae.plan_id
         ORDER BY p.last_name, p.first_name`,
      ),
    );
  }
}
