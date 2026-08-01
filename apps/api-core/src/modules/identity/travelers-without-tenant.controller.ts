import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { ConfigAccessGuard } from '@common/auth/config-access.guard';
import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';

/**
 * Personas registradas (core.persons/core.users, vía
 * core.register_person_and_user) que nunca quedaron como member de
 * ninguna empresa de asistencia al viajero — hoy invisibles en
 * "Usuarios / viajeros" (que lista core.members). Pedido explícito
 * del usuario: poder verlas desde el panel. ConfigAccessGuard porque
 * esto es cross-tenant por definición (un operador de una sola
 * empresa no tiene ningún sentido de negocio para ver esta lista).
 *
 * Pasa por core.get_travelers_without_tenant() (SECURITY DEFINER, gap
 * #30) en vez de un JOIN directo a core.users: esa tabla tiene RLS
 * habilitada sin ninguna policy (003_core_identity.sql), así que un
 * JOIN normal siempre devuelve 0 filas para cualquier operador real —
 * la función se autoriza sola con core.current_operator_can_manage_config().
 */
@ApiTags('identity/travelers-without-tenant')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ConfigAccessGuard)
@Controller('identity/travelers-without-tenant')
export class TravelersWithoutTenantController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Get()
  async list() {
    return this.txManager.runInTransaction((queryRunner) =>
      queryRunner.query(`SELECT * FROM core.get_travelers_without_tenant()`),
    );
  }
}
