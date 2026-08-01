import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { QueryFailedError } from 'typeorm';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { ManageOperatorsGuard } from '@common/auth/config-access.guard';

import { UpdateOperatorAccountDto } from './dto/update-operator-account.dto';

/**
 * El email de login vive en core.users (cifrado + blind index), no en
 * operations.operators — por eso no es editable vía el CRUD genérico
 * (operations-resource.controller.ts) y necesita este endpoint puntual.
 *
 * Rutas de 3 segmentos (":id/account") no colisionan con
 * operations/:resource/:id (2 segmentos tras el prefijo) del controller
 * genérico, así que el orden de registro en el módulo no es crítico acá
 * — pero igual se registra antes por la misma disciplina del resto del
 * módulo.
 */
@ApiTags('operations/operators-account')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ManageOperatorsGuard)
@Controller('operations/operators')
export class OperatorsAccountController {
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

  /**
   * Confirma que operatorId es visible para el llamante (RLS
   * operators_tenant_access ya exige own-tenant o can_manage_config) y
   * devuelve su user_id — paso previo obligatorio antes de tocar
   * core.users, que no tiene ninguna política propia.
   */
  private async resolveUserId(
    queryRunner: import('typeorm').QueryRunner,
    operatorId: string,
  ): Promise<string> {
    const rows = await queryRunner.query(
      `SELECT user_id FROM operations.operators WHERE id = $1`,
      [operatorId],
    );
    if (rows.length === 0) {
      throw new NotFoundException('Operador no encontrado');
    }
    return rows[0].user_id;
  }

  @Get(':id/account')
  async getAccount(@Param('id') id: string): Promise<{ email: string }> {
    return this.txManager.runInTransaction(async (queryRunner) => {
      const userId = await this.resolveUserId(queryRunner, id);
      const [{ email }] = await queryRunner.query(
        `SELECT core.get_user_email($1) AS email`,
        [userId],
      );
      return { email };
    });
  }

  @Patch(':id/account')
  async updateAccount(
    @Param('id') id: string,
    @Body() dto: UpdateOperatorAccountDto,
  ): Promise<{ ok: boolean }> {
    const emailBlindIndex = this.blindIndex(dto.email);

    try {
      return await this.txManager.runInTransaction(async (queryRunner) => {
        const userId = await this.resolveUserId(queryRunner, id);
        await queryRunner.query(`SELECT core.update_user_email($1, $2, $3)`, [
          userId,
          dto.email,
          emailBlindIndex,
        ]);
        return { ok: true };
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
