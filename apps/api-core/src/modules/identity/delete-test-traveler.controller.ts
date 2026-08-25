import { BadRequestException, Controller, Delete, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { TenantTransactionManager } from '@common/database/tenant-transaction.manager';
import { ConfigAccessGuard } from '@common/auth/config-access.guard';

/**
 * Pedido explícito del usuario: "podés poner un botón en el usuario
 * para darlo de baja con toda su info, así podemos hacer pruebas
 * reiteradas con un mismo usuario" — a diferencia de
 * DELETE /clinical/persons/:id/health-record (que solo vacía la ficha
 * de salud), esto borra la cuenta de viajero COMPLETA: perfil, login,
 * contactos, viajes, tokens de compartir, todo — para poder registrar
 * a la misma persona de cero. Acción irreversible y de alto impacto —
 * mismo criterio que health-record-reset: gateada con
 * ConfigAccessGuard, no disponible para un operador común. Ver
 * core.delete_test_traveler_admin (proposed-delete-test-traveler.sql)
 * para el detalle de qué se borra y qué se preserva (catálogos
 * compartidos, cuentas de operador/profesional quedan explícitamente
 * afuera).
 */
@ApiTags('identity/delete-test-traveler')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), ConfigAccessGuard)
@Controller('identity/persons/:personId/delete-test-traveler')
export class DeleteTestTravelerController {
  constructor(private readonly txManager: TenantTransactionManager) {}

  @Delete()
  async delete(@Param('personId') personId: string) {
    try {
      const result = await this.txManager.runInTransaction(async (queryRunner) => {
        const [person] = await queryRunner.query(`SELECT id FROM core.persons WHERE id = $1`, [personId]);
        if (!person) return null;

        const rows = await queryRunner.query(
          `SELECT table_name, deleted_count FROM core.delete_test_traveler_admin($1)`,
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
    } catch (error) {
      // core.delete_test_traveler_admin se niega (RAISE EXCEPTION) si
      // la persona tiene cuenta de operador o de profesional de salud
      // asociada — eso llega acá como un error de Postgres genérico,
      // se traduce a un 400 con el mensaje real en vez de un 500 crudo.
      if (error instanceof NotFoundException) throw error;
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(message.replace(/^error: /i, ''));
    }
  }
}
