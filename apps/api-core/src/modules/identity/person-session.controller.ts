import { Controller, ForbiddenException, Get, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

/**
 * Pedido explícito del usuario al agregar sesión única por viajero en
 * la app móvil ("la app se puede utilizar en dos telefonos en
 * simultaneo... esto no deberia pasar"): si el login nuevo se rechaza
 * porque ya hay una sesión activa (ver AuthService.login), y el
 * viajero no puede cerrarla desde el equipo original (perdido,
 * desinstalado sin logout, etc.), un operador tiene que poder
 * destrabarlo desde acá — "necesitamos una alternativa desde el
 * entorno web por si algo falla". Mismo criterio de acceso que
 * PersonPhoneController (operador del tenant del viajero, o
 * superadmin), resuelto adentro de las funciones SECURITY DEFINER
 * porque core.security_sessions tiene RLS estrictamente self-only.
 */
@ApiTags('identity/persons')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('identity/persons')
export class PersonSessionController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get(':id/session')
  async getActiveSession(@Param('id') id: string) {
    const [row] = await this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT * FROM core.get_active_session_info_for_operator($1)`, [id]),
    );

    return {
      hasActiveSession: row?.has_active_session ?? false,
      sessionStartedAt: row?.session_started_at ?? null,
      lastActivityAt: row?.last_activity_at ?? null,
    };
  }

  @Post(':id/session/revoke')
  async revokeActiveSession(@Param('id') id: string) {
    try {
      const [row] = await this.txManager.runInTransaction((queryRunner) =>
        queryRunner.query(`SELECT core.revoke_active_sessions_for_operator($1) AS revoked_count`, [id]),
      );
      return { revokedCount: row.revoked_count as number };
    } catch (error) {
      const message = (error as Error).message;
      if (message.includes('No autorizado')) {
        throw new ForbiddenException('No autorizado para administrar la sesión de este viajero');
      }
      if (message.includes('No existe una cuenta')) {
        throw new NotFoundException('Este viajero no tiene una cuenta de usuario asociada');
      }
      throw error;
    }
  }
}
