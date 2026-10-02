import { Body, Controller, Get, NotFoundException, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';
import { FeatureFlagEvaluationService } from '@modules/params/feature-flag-evaluation.service';

import { resolveActiveTenant } from './me-member.helper';

/**
 * Catálogo de flags que la app mobile conoce y consulta — a propósito
 * una lista fija acá (no "todo lo que haya en params.feature_flags"),
 * para no filtrar hacia el cliente flags internos/futuros que no le
 * correspondan. Agregar un módulo nuevo gateado es sumar una clave acá
 * + seedearla (ver proposed-fase1-member-branding-and-flags.sql), sin
 * tocar el resto del mecanismo.
 */
const APP_FEATURE_FLAG_KEYS = [
  'nav.coverage_enabled',
  'nav.trips_enabled',
  'nav.emergency_enabled',
  'ai.assistant_enabled',
  'ai.destination_search_enabled',
  'health.classic_mode_enabled',
  'health.structured_mode_enabled',
];

class SetActiveTenantDto {
  @IsUUID()
  tenantId: string;
}

/**
 * Fase 1 — resuelve, para el viajero autenticado, qué marca y qué
 * funciones le corresponden. Siempre devuelve datos reales de ALGÚN
 * tenant (nunca un estado "genérico" sin dueño): sin empresa contratada
 * resuelve al tenant de plataforma (ver resolveActiveTenant).
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('me/tenant-config')
export class MeTenantConfigController {
  constructor(
    private readonly txManager: TenantTransactionManager,
    private readonly flags: FeatureFlagEvaluationService,
  ) {}

  @Get()
  async get(@CurrentContext() context: RequestContextData) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const active = await resolveActiveTenant(queryRunner, context.personId!);

      const [tenant] = await queryRunner.query(
        `SELECT id, code, name FROM core.tenants WHERE id = $1`,
        [active.tenantId],
      );
      if (!tenant) throw new NotFoundException('Tenant activo no encontrado');

      const [brandProfile] = await queryRunner.query(
        `SELECT logo_url, logo_dark_url, logo_icon_url, favicon_url, theme_id
         FROM core.tenant_brand_profiles WHERE tenant_id = $1 LIMIT 1`,
        [active.tenantId],
      );

      let theme = null;
      if (brandProfile?.theme_id) {
        const [themeRow] = await queryRunner.query(
          `SELECT color_primary, color_secondary, color_accent, color_success,
                  color_warning, color_danger, color_bg_primary, color_text_primary,
                  color_emergency_alert, font_family_primary, font_size_base,
                  border_radius_md, splash_bg_color
           FROM params.tenant_themes WHERE id = $1 AND is_active = TRUE`,
          [brandProfile.theme_id],
        );
        theme = themeRow ?? null;
      }

      const enabledFeatures = await this.flags.evaluateMany(
        queryRunner,
        APP_FEATURE_FLAG_KEYS,
        { tenantId: active.tenantId, memberId: active.memberId },
      );

      return {
        tenantId: tenant.id,
        tenantCode: tenant.code,
        tenantName: tenant.name,
        isPlatformTenant: active.isPlatformTenant,
        brand: brandProfile
          ? {
              logoUrl: brandProfile.logo_url,
              logoDarkUrl: brandProfile.logo_dark_url,
              logoIconUrl: brandProfile.logo_icon_url,
              faviconUrl: brandProfile.favicon_url,
            }
          : null,
        theme,
        enabledFeatures,
      };
    });
  }

  /** Solo devuelve algo cuando el viajero tiene más de una empresa con enrollment vigente (selector). */
  @Get('available')
  async available(@CurrentContext() context: RequestContextData) {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT DISTINCT ON (t.id) t.id AS "tenantId", t.code AS "tenantCode", t.name AS "tenantName"
         FROM coverage.travel_assistance_enrollments e
         JOIN core.members m ON m.id = e.member_id
         JOIN core.tenants t ON t.id = e.tenant_id
         WHERE m.person_id = $1
           AND e.status_id = params.catalog_id('ENROLLMENT_STATUS', 'ACTIVE')
           AND e.valid_from <= (NOW() AT TIME ZONE e.timezone_rule)
           AND e.valid_until >= (NOW() AT TIME ZONE e.timezone_rule)
         ORDER BY t.id`,
        [context.personId],
      ),
    );
  }

  @Patch('active-tenant')
  async setActiveTenant(
    @CurrentContext() context: RequestContextData,
    @Body() dto: SetActiveTenantDto,
  ) {
    await this.txManager.runInTransaction(async (queryRunner) => {
      const [member] = await queryRunner.query(
        `SELECT m.id FROM core.members m
         JOIN coverage.travel_assistance_enrollments e ON e.member_id = m.id
         WHERE m.person_id = $1 AND m.tenant_id = $2
           AND e.status_id = params.catalog_id('ENROLLMENT_STATUS', 'ACTIVE')
           AND e.valid_from <= (NOW() AT TIME ZONE e.timezone_rule)
           AND e.valid_until >= (NOW() AT TIME ZONE e.timezone_rule)
         LIMIT 1`,
        [context.personId, dto.tenantId],
      );
      if (!member) {
        throw new NotFoundException('No tenés un enrollment vigente con esa empresa');
      }
      await queryRunner.query(
        `INSERT INTO core.member_branding_preferences (person_id, active_member_id, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (person_id) DO UPDATE SET active_member_id = $2, updated_at = NOW()`,
        [context.personId, member.id],
      );
    });
    return this.get(context);
  }
}
