import { Controller, Delete, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { ConfigAccessGuard } from '@common/auth/config-access.guard';

/**
 * Pedido explícito del usuario: para poder probar de cero repetidas
 * veces (chat Clásico/Estructurado, formularios manuales), necesita
 * poder borrar TODOS los antecedentes de un viajero de un solo botón
 * en vez de pedírmelo cada vez. Acción irreversible y de alto impacto
 * — gateada con ConfigAccessGuard (mismo criterio que Catálogos/
 * Parámetros/Preguntas del asistente), no disponible para un operador
 * común.
 */
@ApiTags('clinical/health-record-reset')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ConfigAccessGuard)
@Controller('clinical/persons/:personId/health-record')
export class HealthRecordResetController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Delete()
  async reset(@Param('personId') personId: string) {
    const result = await this.txManager.runInTransaction(async (queryRunner) => {
      const [person] = await queryRunner.query(
        `SELECT id FROM core.persons WHERE id = $1`,
        [personId],
      );
      if (!person) return null;

      // clinical.conditions/allergies/medications/surgeries/implants_devices
      // tienen DELETE bloqueado por RLS a propósito (medico-legal) — el
      // rol de runtime (medtravel_app) no puede saltárselo con un DELETE
      // crudo, hace falta la función SECURITY DEFINER (ver
      // proposed-health-record-reset-fix.sql). También limpia ai.* y
      // resetea health_record_last_updated_at (el trigger de borrado
      // lo re-setearía a NOW() si no se pisara acá).
      const rows = await queryRunner.query(
        `SELECT table_name, deleted_count FROM clinical.reset_health_record_admin($1)`,
        [personId],
      );
      const counts: Record<string, number> = {};
      for (const row of rows) {
        counts[row.table_name] = row.deleted_count;
      }

      return counts;
    });

    if (!result) {
      throw new NotFoundException('Persona no encontrada');
    }
    return { ok: true, deleted: result };
  }
}
