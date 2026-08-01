import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { ConfigAccessGuard } from '@common/auth/config-access.guard';
import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

import { UpdateHealthcareProviderDto } from './dto/update-healthcare-provider.dto';

interface AuthenticatedRequest extends Request {
  user: { userId: string };
}

/**
 * Revisión/administración de coverage.healthcare_providers — separado
 * del CRUD genérico por la acción de "fusionar duplicados" (pedido
 * explícito del usuario: un viajero puede cargar un prestador con un
 * nombre distinto para algo que ya existe), que reasigna FKs en una
 * transacción.
 */
@ApiTags('coverage/admin/healthcare-providers')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ConfigAccessGuard)
@Controller('coverage/admin/healthcare-providers')
export class HealthcareProvidersAdminController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  /** ?lifecycleStatus=DRAFT para la cola de "Pendientes de confirmación". */
  @Get()
  async list(
    @Query('countryId') countryId?: string,
    @Query('lifecycleStatus') lifecycleStatus?: string,
  ) {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    if (countryId) {
      conditions.push(`hp.country_id = $${i++}`);
      values.push(countryId);
    }
    if (lifecycleStatus) {
      conditions.push(`hp.lifecycle_status = $${i++}`);
      values.push(lifecycleStatus);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(
        `SELECT hp.id, hp.code, hp.name, hp.lifecycle_status, hp.active,
                hp.country_id, cv.label_es AS country_label,
                hp.provider_type_id, pt.label_es AS provider_type_label,
                hp.submitted_by_person_id,
                core.decrypt_pii(p.first_name) AS submitted_by_first_name,
                core.decrypt_pii(p.last_name) AS submitted_by_last_name,
                hp.approved_at, hp.created_at
         FROM coverage.healthcare_providers hp
         JOIN params.catalog_values cv ON cv.id = hp.country_id
         JOIN params.catalog_values pt ON pt.id = hp.provider_type_id
         LEFT JOIN core.persons p ON p.id = hp.submitted_by_person_id
         ${where}
         ORDER BY hp.created_at DESC
         LIMIT 500`,
        values,
      ),
    );
  }

  @Patch(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateHealthcareProviderDto,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const sets: string[] = [];
      const values: unknown[] = [];
      let i = 1;
      const push = (column: string, value: unknown) => {
        sets.push(`${column} = $${i++}`);
        values.push(value);
      };

      if (dto.name !== undefined) push('name', dto.name);
      if (dto.code !== undefined) push('code', dto.code);
      if (dto.providerTypeId !== undefined) push('provider_type_id', dto.providerTypeId);
      if (dto.countryId !== undefined) push('country_id', dto.countryId);
      if (dto.active !== undefined) push('active', dto.active);
      if (dto.lifecycleStatus !== undefined) {
        push('lifecycle_status', dto.lifecycleStatus);
        if (dto.lifecycleStatus === 'ACTIVE' || dto.lifecycleStatus === 'APPROVED') {
          push('approved_by', request.user.userId);
          sets.push(`approved_at = NOW()`);
        }
      }

      if (sets.length === 0) {
        return { id };
      }

      values.push(id);
      const [row] = await queryRunner.query(
        `UPDATE coverage.healthcare_providers SET ${sets.join(', ')} WHERE id = $${i} RETURNING id`,
        values,
      );
      return { id: row.id };
    });
  }

  /**
   * Fusiona `draftId` (típicamente un DRAFT cargado por un viajero,
   * duplicado de algo que ya existe con otro nombre) en `targetId`:
   * reasigna toda cobertura y todo plan que apuntaba al duplicado, y
   * lo retira.
   */
  @Post(':draftId/merge/:targetId')
  async merge(
    @Param('draftId') draftId: string,
    @Param('targetId') targetId: string,
  ) {
    return this.txManager.runInTransaction(async (queryRunner) => {
      await queryRunner.query(
        `UPDATE coverage.health_coverages SET provider_id = $1 WHERE provider_id = $2`,
        [targetId, draftId],
      );
      await queryRunner.query(
        `UPDATE coverage.healthcare_plans SET provider_id = $1 WHERE provider_id = $2`,
        [targetId, draftId],
      );
      await queryRunner.query(
        `UPDATE coverage.healthcare_providers
         SET lifecycle_status = 'RETIRED', active = FALSE, merged_into_id = $1
         WHERE id = $2`,
        [targetId, draftId],
      );
      return { mergedInto: targetId };
    });
  }
}
