import {
  BadRequestException,
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
import { CurrentContext } from '@common/request-context/current-context.decorator';
import { RequestContextData } from '@common/request-context/request-context.types';
import { ManageOperatorsGuard } from '@common/auth/config-access.guard';

import { RegisterOperatorDto } from './dto/register-operator.dto';

/**
 * Igual que professionals-registration.controller.ts: un operador ES un
 * core.users (B7, ver operator.entity.ts) — reutiliza
 * core.register_person_and_user (SECURITY DEFINER) para el alta de
 * login, y después inserta en operations.operators (que ya tiene RLS
 * tenant-scoped propia desde gap #8, operators_tenant_access).
 *
 * tenant_id SIEMPRE sale del contexto del que está creando (JWT), nunca
 * del body — un operador solo puede dar de alta operadores de su propio
 * tenant. Cruzar tenants es exclusivamente el camino de break-glass
 * auditado, no este endpoint.
 */
@ApiTags('operations/operators-registration')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ManageOperatorsGuard)
@Controller('operations/operators-registration')
export class OperatorsRegistrationController {
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
  async register(
    @CurrentContext() context: RequestContextData,
    @Body() dto: RegisterOperatorDto,
  ) {
    if (!context.tenantId) {
      throw new BadRequestException(
        'Solo un operador con tenant asignado puede dar de alta otros operadores',
      );
    }
    const emailBlindIndex = this.blindIndex(dto.email);
    const passwordHash = await bcrypt.hash(dto.password, 10);

    try {
      return await this.txManager.runInTransaction(async (queryRunner) => {
        const [{ user_id }] = await queryRunner.query(
          `SELECT * FROM core.register_person_and_user($1, $2, $3, $4, $5)`,
          [
            dto.firstName,
            dto.lastName,
            dto.email,
            emailBlindIndex,
            passwordHash,
          ],
        );

        const [operator] = await queryRunner.query(
          `INSERT INTO operations.operators
             (tenant_id, role_id, user_id, first_name, last_name, operator_type_id,
              specialty_id, status_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7,
             params.catalog_id('OPERATOR_STATUS', 'ACTIVE'))
           RETURNING id, first_name, last_name, role_id, operator_type_id,
                     specialty_id, status_id, created_at`,
          [
            context.tenantId,
            dto.roleId,
            user_id,
            dto.firstName,
            dto.lastName,
            dto.operatorTypeId,
            dto.specialtyId ?? null,
          ],
        );

        return operator;
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error as QueryFailedError & { code?: string }).code === '23505'
      ) {
        throw new ConflictException('Ya existe una cuenta con ese email');
      }
      throw error;
    }
  }
}
